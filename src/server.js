// src/server.js
const { Pool, Client } = require('pg');

class NEONDB {
    constructor() {
        this.pool = null;
        this.isReady = false;
        this.preparedStatements = new Map();
        this.connectionConfig = this.getConnectionConfig();
        this.queryCount = 0;
        this.slowQueryThreshold = GetConvarInt('pgsql_slow_query_warning', 100);
        this.debugMode = GetConvar('pgsql_debug', 'false') === 'true';
        this.booleanColumns = new Set();
        this.tableInfoCache = new Map();

        // NeonDB optimized settings
        this.queryBatch = [];
        this.batchingEnabled = GetConvar('pgsql_enable_batching', 'true') === 'true';
        this.batchMaxSize = GetConvarInt('pgsql_batch_max_size', 10);
        this.batchTimeout = GetConvarInt('pgsql_batch_timeout', 50);
        this.batchTimer = null;

        // Connection management
        this.warmupInterval = null;
        this.warmupEnabled = GetConvar('pgsql_enable_warmup', 'true') === 'true';
        this.warmupFrequency = GetConvarInt('pgsql_warmup_frequency', 300000);
        this.retryConfig = {
            maxRetries: GetConvarInt('pgsql_max_retries', 5),
            initialDelay: GetConvarInt('pgsql_retry_delay', 100),
            maxDelay: GetConvarInt('pgsql_max_retry_delay', 5000)
        };

        // Metrics
        this.metrics = {
            coldStarts: 0,
            reconnects: 0,
            lastConnectTime: 0,
            storageStats: { lastCheck: 0 }
        };

        this.init();
    }

    // SQL Builder Methods
    select(table, columns = '*', where = null, orderBy = null, limit = null) {
        let query = `SELECT ${Array.isArray(columns) ? columns.join(', ') : columns} FROM ${table}`;
        const params = [];
        let paramIndex = 1;

        if (where) {
            if (typeof where === 'string') {
                query += ` WHERE ${where}`;
            } else if (typeof where === 'object') {
                const conditions = [];
                for (const [key, value] of Object.entries(where)) {
                    conditions.push(`${key} = $${paramIndex++}`);
                    params.push(value);
                }
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
        }

        if (orderBy) {
            query += ` ORDER BY ${orderBy}`;
        }

        if (limit) {
            query += ` LIMIT ${limit}`;
        }

        return this.query(query, params);
    }

    insert(table, data) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`;
        return this.execute(query, values);
    }

    update(table, data, where) {
        const updates = [];
        const params = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(data)) {
            updates.push(`${key} = $${paramIndex++}`);
            params.push(value);
        }

        let query = `UPDATE ${table} SET ${updates.join(', ')}`;

        if (where) {
            if (typeof where === 'string') {
                query += ` WHERE ${where}`;
            } else if (typeof where === 'object') {
                const conditions = [];
                for (const [key, value] of Object.entries(where)) {
                    conditions.push(`${key} = $${paramIndex++}`);
                    params.push(value);
                }
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
        }

        return this.execute(query, params);
    }

    delete(table, where) {
        const params = [];
        let paramIndex = 1;
        let query = `DELETE FROM ${table}`;

        if (where) {
            if (typeof where === 'string') {
                query += ` WHERE ${where}`;
            } else if (typeof where === 'object') {
                const conditions = [];
                for (const [key, value] of Object.entries(where)) {
                    conditions.push(`${key} = $${paramIndex++}`);
                    params.push(value);
                }
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
        }

        return this.execute(query, params);
    }

    createTable(tableName, columns, options = {}) {
        let query = `CREATE TABLE ${options.ifNotExists ? 'IF NOT EXISTS ' : ''}${tableName} (`;

        const columnDefs = [];
        for (const [name, definition] of Object.entries(columns)) {
            columnDefs.push(`${name} ${definition}`);
        }

        query += columnDefs.join(', ');
        query += ')';

        return this.execute(query);
    }

    dropTable(tableName, ifExists = true) {
        const query = `DROP TABLE ${ifExists ? 'IF EXISTS ' : ''}${tableName}`;
        return this.execute(query);
    }

    // Get the calling resource and file information
    getCallerInfo() {
        try {
            // Get current resource name
            const resourceName = GetCurrentResourceName();

            // Get stack trace info from FiveM's debug system
            const stackInfo = debug.getinfo(3, 'Sl');

            if (stackInfo && stackInfo.source) {
                // Clean up the source path to show just the file name
                const fileName = stackInfo.source.replace(/^@/, '').split('/').pop();
                const lineNumber = stackInfo.currentline || 'unknown';

                return {
                    resource: resourceName,
                    file: fileName,
                    line: lineNumber,
                    location: `${resourceName}/${fileName}:${lineNumber}`
                };
            }

            return {
                resource: resourceName,
                file: 'unknown',
                line: 'unknown',
                location: `${resourceName}/unknown:unknown`
            };
        } catch (error) {
            return {
                resource: 'unknown',
                file: 'unknown',
                line: 'unknown',
                location: 'unknown/unknown:unknown'
            };
        }
    }

    // Create enhanced error with FiveM-specific caller info
    createEnhancedError(originalError, query, parameters, callerInfo) {
        const enhancedError = new Error(originalError.message);
        enhancedError.name = originalError.name;
        enhancedError.code = originalError.code;
        enhancedError.detail = originalError.detail;
        enhancedError.hint = originalError.hint;
        enhancedError.position = originalError.position;
        enhancedError.query = query;
        enhancedError.parameters = parameters;
        enhancedError.callerInfo = callerInfo;

        // Create a more meaningful stack trace
        const stackLines = [
            `${enhancedError.name}: ${enhancedError.message}`,
            `    at ${callerInfo.location}`,
            `    Query: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`,
            `    Parameters: ${JSON.stringify(parameters)}`
        ];

        enhancedError.stack = stackLines.join('\n');

        return enhancedError;
    }

    // Log error with detailed information
    logError(error, operation = 'Database Operation') {
        console.error(`^1[NEONDB] ^7${operation} failed:`);
        console.error(`^1[NEONDB] ^7Error: ${error.message}`);

        if (error.callerInfo) {
            console.error(`^1[NEONDB] ^7Location: ${error.callerInfo.location}`);
        }

        if (error.query) {
            console.error(`^1[NEONDB] ^7Query: ${error.query.substring(0, 200)}${error.query.length > 200 ? '...' : ''}`);
        }

        if (error.parameters && error.parameters.length > 0) {
            console.error(`^1[NEONDB] ^7Parameters: ${JSON.stringify(error.parameters)}`);
        }

        if (error.detail) {
            console.error(`^1[NEONDB] ^7Detail: ${error.detail}`);
        }

        if (error.hint) {
            console.error(`^1[NEONDB] ^7Hint: ${error.hint}`);
        }
    }

    getConnectionConfig() {
        const connectionString = GetConvar('pgsql_connection_string', '');

        const config = connectionString ? { connectionString } : {
            host: GetConvar('pgsql_host', 'localhost'),
            port: GetConvarInt('pgsql_port', 5432),
            database: GetConvar('pgsql_database', 'fivem'),
            user: GetConvar('pgsql_user', 'postgres'),
            password: GetConvar('pgsql_password', '')
        };

        // Common connection options
        return {
            ...config,
            max: GetConvarInt('pgsql_max_connections', 20),
            min: GetConvarInt('pgsql_min_connections', 5),
            idleTimeoutMillis: GetConvarInt('pgsql_idle_timeout', 30000),
            connectionTimeoutMillis: GetConvarInt('pgsql_connection_timeout', 10000),
            acquireTimeoutMillis: GetConvarInt('pgsql_acquire_timeout', 10000),
            ssl: GetConvar('pgsql_ssl', 'true') === 'true' ? { rejectUnauthorized: false } : false,
            statement_timeout: GetConvarInt('pgsql_statement_timeout', 60000),
            query_timeout: GetConvarInt('pgsql_query_timeout', 60000),
            application_name: 'FiveM-NEONDB',
            // NeonDB optimizations
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000
        };
    }

    async init() {
        try {
            this.pool = new Pool(this.connectionConfig);

            // Setup connection pool event handlers
            this.pool.on('error', this.handlePoolError.bind(this));
            this.pool.on('connect', this.handleClientConnect.bind(this));

            // Test connection with retry
            await this.connectWithRetry();

            // Start background warmup if enabled
            if (this.warmupEnabled) {
                this.startWarmupInterval();
            }

            // Schedule storage monitoring
            setTimeout(() => this.monitorStorage(), 10000);
        } catch (error) {
            console.error('^6NEONDB: ^7Failed to connect to database:', error.message);
            this.isReady = false;
            setTimeout(() => this.init(), 5000);
        }
    }

    handlePoolError(err) {
        console.error('^6NEONDB: ^7Pool error:', err.message);

        if (err.message.includes('connection terminated') ||
            err.message.includes('connection idle') ||
            err.message.includes('timeout')) {

            this.metrics.reconnects++;

            if (this.isReady) {
                console.log('^6NEONDB: ^7Attempting to reconnect after connection error...');
                this.isReady = false;
                this.connectWithRetry();
            }
        }
    }

    handleClientConnect(client) {
        if (this.debugMode) {
            console.log('^6NEONDB: ^7New client connected');
        }

        // Set session parameters for better performance with NeonDB
        client.query(`
            SET statement_timeout = ${this.connectionConfig.statement_timeout};
            SET idle_in_transaction_session_timeout = ${this.connectionConfig.idleTimeoutMillis};
        `).catch(err => {
            console.error('^6NEONDB: ^7Failed to set session parameters:', err.message);
        });
    }

    async connectWithRetry(attempt = 0) {
        const { maxRetries, initialDelay, maxDelay } = this.retryConfig;
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

        try {
            const startTime = Date.now();
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as server_time, version() as version');
            client.release();

            const connectTime = Date.now() - startTime;
            this.metrics.lastConnectTime = connectTime;

            if (connectTime > 1000) {
                this.metrics.coldStarts++;
                console.log(`^6NEONDB: ^7Cold start detected (${connectTime}ms)`);
            }

            this.isReady = true;

            console.log('^6NEONDB: ^7Connected to PostgreSQL database successfully');
            console.log('^6NEONDB: ^7Server time:', result.rows[0].server_time);
            console.log('^6NEONDB: ^7PostgreSQL version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
            console.log('^6NEONDB: ^7Connection pool initialized with', this.connectionConfig.max, 'max connections');

        } catch (error) {
            if (attempt < maxRetries) {
                console.log(`^6NEONDB: ^7Connection attempt ${attempt + 1}/${maxRetries + 1} failed: ${error.message}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.connectWithRetry(attempt + 1);
            }
            throw error;
        }
    }

    async getClient() {
        if (!this.isReady) {
            throw new Error('Database not ready');
        }

        try {
            return await this.pool.connect();
        } catch (error) {
            // Handle cold start issues
            if (error.message.includes('timeout') ||
                error.message.includes('no connections available')) {

                this.metrics.coldStarts++;
                console.log('^6NEONDB: ^7Cold start detected, attempting recovery...');

                // Try a direct connection to warm up
                try {
                    const directClient = new Client(this.connectionConfig);
                    await directClient.connect();
                    await directClient.query('SELECT 1');
                    await directClient.end();

                    // Retry getting a pooled client
                    return await this.pool.connect();
                } catch (warmupError) {
                    console.error('^6NEONDB: ^7Warmup failed:', warmupError.message);
                    throw error; // Rethrow the original error
                }
            }
            throw error;
        }
    }

    startWarmupInterval() {
        if (this.warmupInterval) {
            clearInterval(this.warmupInterval);
        }

        this.warmupInterval = setInterval(async () => {
            if (!this.isReady) return;

            try {
                const client = await this.pool.connect();
                await client.query('SELECT 1');
                client.release();

                if (this.debugMode) {
                    console.log('^6NEONDB: ^7Warmup query completed');
                }
            } catch (error) {
                console.error('^6NEONDB: ^7Warmup query failed:', error.message);
            }
        }, this.warmupFrequency);
    }

    async monitorStorage() {
        if (!this.isReady) {
            setTimeout(() => this.monitorStorage(), 60000);
            return;
        }

        try {
            const client = await this.getClient();
            const result = await client.query(`
                SELECT
                    schemaname,
                    relname as table_name,
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as size
                FROM pg_stat_user_tables
                ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC
                LIMIT 5;
            `);
            client.release();

            this.metrics.storageStats = {
                topTables: result.rows,
                lastCheck: Date.now()
            };

            if (this.debugMode) {
                console.log('^6NEONDB: ^7Storage stats updated');
            }
        } catch (error) {
            console.error('^6NEONDB: ^7Failed to monitor storage:', error.message);
        }

        // Schedule next check
        setTimeout(() => this.monitorStorage(), 3600000); // Check every hour
    }

    processBatch() {
        if (this.queryBatch.length === 0) return;

        const batch = [...this.queryBatch];
        this.queryBatch = [];
        this.batchTimer = null;

        if (this.debugMode) {
            console.log(`^6NEONDB: ^7Processing batch of ${batch.length} queries`);
        }

        this.getClient().then(async client => {
            try {
                await client.query('BEGIN');

                for (const item of batch) {
                    try {
                        const result = await client.query(item.query, item.params);
                        item.resolve({
                            success: true,
                            result: result
                        });
                    } catch (err) {
                        // Create enhanced error with caller info
                        const enhancedError = this.createEnhancedError(err, item.query, item.params, item.callerInfo);
                        item.resolve({
                            success: false,
                            error: enhancedError
                        });
                    }
                }

                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => { });

                for (const item of batch) {
                    if (!item.processed) {
                        const enhancedError = this.createEnhancedError(error, item.query, item.params, item.callerInfo);
                        item.resolve({
                            success: false,
                            error: enhancedError
                        });
                    }
                }
            } finally {
                client.release();
            }
        }).catch(error => {
            for (const item of batch) {
                const enhancedError = this.createEnhancedError(error, item.query, item.params, item.callerInfo);
                item.resolve({
                    success: false,
                    error: enhancedError
                });
            }
        });
    }

    addToBatch(query, params, callerInfo) {
        return new Promise(resolve => {
            this.queryBatch.push({
                query,
                params,
                callerInfo,
                resolve,
                processed: false
            });

            if (!this.batchTimer) {
                this.batchTimer = setTimeout(() => this.processBatch(), this.batchTimeout);
            }

            if (this.queryBatch.length >= this.batchMaxSize) {
                clearTimeout(this.batchTimer);
                this.batchTimer = null;
                this.processBatch();
            }
        });
    }

    parseParameters(parameters) {
        if (!parameters) return [];
        if (Array.isArray(parameters)) return parameters;
        if (typeof parameters === 'object') return Object.values(parameters);
        return [parameters];
    }

    convertMySQLToPostgreSQL(query) {
        let convertedQuery = query;
        let paramIndex = 1;

        // Replace ? with $1, $2, etc.
        convertedQuery = convertedQuery.replace(/\?/g, () => `$${paramIndex++}`);

        // Basic MySQL to PostgreSQL conversions
        convertedQuery = convertedQuery.replace(/NOW\(\)/gi, 'NOW()');
        convertedQuery = convertedQuery.replace(/UNIX_TIMESTAMP\(\)/gi, 'EXTRACT(EPOCH FROM NOW())');
        convertedQuery = convertedQuery.replace(/UNIX_TIMESTAMP\(([^)]+)\)/gi, 'EXTRACT(EPOCH FROM $1)');
        convertedQuery = convertedQuery.replace(/FROM_UNIXTIME\(([^)]+)\)/gi, 'TO_TIMESTAMP($1)');
        convertedQuery = convertedQuery.replace(/LIMIT\s+(\d+)\s*,\s*(\d+)/gi, 'LIMIT $2 OFFSET $1');
        convertedQuery = convertedQuery.replace(/`/g, '"');
        convertedQuery = convertedQuery.replace(/AUTO_INCREMENT/gi, 'SERIAL');
        convertedQuery = convertedQuery.replace(/INT\s+UNSIGNED/gi, 'INTEGER');
        convertedQuery = convertedQuery.replace(/BIGINT\s+UNSIGNED/gi, 'BIGINT');
        convertedQuery = convertedQuery.replace(/TINYINT\(1\)/gi, 'BOOLEAN');
        convertedQuery = convertedQuery.replace(/DATETIME/gi, 'TIMESTAMP');

        // Handle boolean columns
        const booleanColumns = [
            'enabled', 'active', 'visible', 'online', 'banned', 'locked',
            'verified', 'deleted', 'archived', 'public', 'available', 'completed'
        ].join('|');

        const boolPattern = `\\b(${booleanColumns})\\b`;

        // Convert boolean comparisons
        convertedQuery = convertedQuery.replace(new RegExp(`${boolPattern}\\s*=\\s*1\\b`, 'gi'), '$1::integer = 1');
        convertedQuery = convertedQuery.replace(new RegExp(`${boolPattern}\\s*=\\s*0\\b`, 'gi'), '$1::integer = 0');
        convertedQuery = convertedQuery.replace(new RegExp(`${boolPattern}\\s*=\\s*true\\b`, 'gi'), '$1::integer = 1');
        convertedQuery = convertedQuery.replace(new RegExp(`${boolPattern}\\s*=\\s*false\\b`, 'gi'), '$1::integer = 0');

        return convertedQuery;
    }

    async getTableInfo(tableName) {
        if (this.tableInfoCache.has(tableName)) {
            return this.tableInfoCache.get(tableName);
        }

        try {
            const client = await this.getClient();
            const result = await client.query(`
                SELECT 
                    a.attname as column_name,
                    format_type(a.atttypid, a.atttypmod) as data_type,
                    pg_get_expr(d.adbin, d.adrelid) as default_value,
                    a.attnotnull as not_null,
                    (SELECT EXISTS (
                        SELECT 1 FROM pg_constraint c 
                        WHERE c.conrelid = a.attrelid 
                        AND c.conkey[1] = a.attnum 
                        AND c.contype = 'p'
                    )) as is_primary_key
                FROM pg_attribute a
                LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                WHERE a.attrelid = $1::regclass
                AND a.attnum > 0
                AND NOT a.attisdropped
                ORDER BY a.attnum
            `, [tableName]);
            client.release();

            const tableInfo = {
                columns: {},
                primaryKey: null,
                hasIdentityColumn: false
            };

            for (const row of result.rows) {
                tableInfo.columns[row.column_name] = {
                    dataType: row.data_type,
                    notNull: row.not_null,
                    isPrimaryKey: row.is_primary_key,
                    defaultValue: row.default_value
                };

                if (row.is_primary_key) {
                    tableInfo.primaryKey = row.column_name;
                    if (row.default_value && (row.default_value.includes('nextval') || row.default_value.includes('identity'))) {
                        tableInfo.hasIdentityColumn = true;
                    }
                }
            }

            this.tableInfoCache.set(tableName, tableInfo);
            return tableInfo;
        } catch (error) {
            console.error(`^6NEONDB: ^7Failed to get table info for ${tableName}:`, error.message);
            return { columns: {}, primaryKey: null, hasIdentityColumn: false };
        }
    }

    async getUniqueId(tableName) {
        const client = await this.getClient();
        try {
            const result = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 + floor(random() * 10) as next_id FROM ${tableName}`);
            return result.rows[0].next_id;
        } finally {
            client.release();
        }
    }

    getInsertId(result) {
        if (result.rows && result.rows.length > 0) {
            const row = result.rows[0];
            if (row.id !== undefined) return row.id;

            // If we can't find a specific ID column, return the first column's value
            const firstKey = Object.keys(row)[0];
            return row[firstKey];
        }
        return null;
    }

    async handleQueryError(error, query, params, startTime, callerInfo) {
        // Handle NOT NULL constraint violations for INSERT queries
        if (error.message.includes('violates not-null constraint') &&
            query.toLowerCase().includes('insert into')) {

            // Extract table name from query
            const tableMatch = query.match(/insert\s+into\s+([^\s(]+)/i);
            if (!tableMatch) return null;

            const tableName = tableMatch[1].replace(/["'`]/g, '');

            // Get table info to find primary key
            const tableInfo = await this.getTableInfo(tableName);
            if (!tableInfo.primaryKey) return null;

            // Extract column list from query
            const columnMatch = query.match(/\(([^)]+)\)/);
            if (!columnMatch) return null;

            const columns = columnMatch[1].trim();

            // Check if the primary key is missing from the column list
            if (!columns.toLowerCase().includes(tableInfo.primaryKey.toLowerCase())) {
                try {
                    // Generate a unique ID
                    const uniqueId = await this.getUniqueId(tableName);

                    // Create fixed query with ID
                    const fixedQuery = `
                        INSERT INTO ${tableName} 
                        (${tableInfo.primaryKey}, ${columns}) 
                        VALUES 
                        ($1, ${params.map((_, i) => `$${i + 2}`).join(', ')})
                        RETURNING ${tableInfo.primaryKey}
                    `;

                    const client = await this.getClient();
                    const result = await client.query(fixedQuery, [uniqueId, ...params]);
                    client.release();

                    return {
                        affectedRows: result.rowCount || 0,
                        insertId: result.rows[0][tableInfo.primaryKey],
                        warningCount: 0,
                        changedRows: result.rowCount || 0,
                        fieldCount: result.fields ? result.fields.length : 0,
                        serverStatus: 2,
                        info: '',
                        executionTime: Date.now() - startTime
                    };
                } catch (fixError) {
                    const enhancedError = this.createEnhancedError(fixError, fixedQuery, [uniqueId, ...params], callerInfo);
                    this.logError(enhancedError, 'INSERT Fix');
                    throw enhancedError;
                }
            }
        }

        // Handle duplicate key violations
        if (error.message.includes('duplicate key value violates unique constraint')) {
            const tableMatch = query.match(/insert\s+into\s+([^\s(]+)/i);
            if (tableMatch) {
                const tableName = tableMatch[1].replace(/["'`]/g, '');
                const tableInfo = await this.getTableInfo(tableName);

                if (tableInfo.primaryKey) {
                    try {
                        // Generate a new unique ID
                        const uniqueId = await this.getUniqueId(tableName);

                        // Modify the first parameter (assuming it's the ID)
                        const newParams = [...params];
                        newParams[0] = uniqueId;

                        const client = await this.getClient();
                        const result = await client.query(query, newParams);
                        client.release();

                        return {
                            affectedRows: result.rowCount || 0,
                            insertId: this.getInsertId(result),
                            warningCount: 0,
                            changedRows: result.rowCount || 0,
                            fieldCount: result.fields ? result.fields.length : 0,
                            serverStatus: 2,
                            info: '',
                            executionTime: Date.now() - startTime
                        };
                    } catch (retryError) {
                        const enhancedError = this.createEnhancedError(retryError, query, newParams, callerInfo);
                        this.logError(enhancedError, 'Duplicate Key Retry');
                        throw enhancedError;
                    }
                }
            }
        }

        return null;
    }

    async execute(query, parameters = [], callback = null) {
        const callerInfo = this.getCallerInfo();

        if (!this.isReady) {
            const error = new Error('Database not ready');
            const enhancedError = this.createEnhancedError(error, query, parameters, callerInfo);
            this.logError(enhancedError, 'Execute');
            if (callback) callback(false, enhancedError.message);
            return Promise.reject(enhancedError);
        }

        const startTime = Date.now();
        const parsedParams = this.parseParameters(parameters);
        const convertedQuery = this.convertMySQLToPostgreSQL(query);

        // Use batching for write operations if enabled
        if (this.batchingEnabled &&
            (query.toLowerCase().startsWith('insert') ||
                query.toLowerCase().startsWith('update') ||
                query.toLowerCase().startsWith('delete'))) {

            try {
                const { success, result, error } = await this.addToBatch(convertedQuery, parsedParams, callerInfo);

                if (!success) {
                    this.logError(error, 'Execute (Batch)');
                    throw error;
                }

                const response = {
                    affectedRows: result.rowCount || 0,
                    insertId: this.getInsertId(result),
                    warningCount: 0,
                    changedRows: result.rowCount || 0,
                    fieldCount: result.fields ? result.fields.length : 0,
                    serverStatus: 2,
                    info: '',
                    executionTime: Date.now() - startTime
                };

                if (callback) callback(response);
                return response;
            } catch (error) {
                if (callback) callback(false, error.message);
                return Promise.reject(error);
            }
        }

        // Handle direct execution
        try {
            const client = await this.getClient();
            const result = await client.query(convertedQuery, parsedParams);
            client.release();

            const executionTime = Date.now() - startTime;
            this.queryCount++;

            if (executionTime > this.slowQueryThreshold) {
                console.warn(`^3[NEONDB] ^7Slow query detected (${executionTime}ms) at ${callerInfo.location}:`, convertedQuery.substring(0, 100));
            }

            const response = {
                affectedRows: result.rowCount || 0,
                insertId: this.getInsertId(result),
                warningCount: 0,
                changedRows: result.rowCount || 0,
                fieldCount: result.fields ? result.fields.length : 0,
                serverStatus: 2,
                info: '',
                executionTime: executionTime
            };

            if (callback) callback(response);
            return response;
        } catch (error) {
            const enhancedError = this.createEnhancedError(error, convertedQuery, parsedParams, callerInfo);
            this.logError(enhancedError, 'Execute');

            // Try to handle the error generically
            try {
                const fixedResponse = await this.handleQueryError(enhancedError, convertedQuery, parsedParams, startTime, callerInfo);
                if (fixedResponse) {
                    if (callback) callback(fixedResponse);
                    return fixedResponse;
                }
            } catch (fixError) {
                // If fixing fails, continue with original error
            }

            if (callback) callback(false, enhancedError.message);
            return Promise.reject(enhancedError);
        }
    }

    async query(query, parameters = [], callback = null) {
        const callerInfo = this.getCallerInfo();

        if (!this.isReady) {
            const error = new Error('Database not ready');
            const enhancedError = this.createEnhancedError(error, query, parameters, callerInfo);
            this.logError(enhancedError, 'Query');
            if (callback) callback([]);
            return Promise.reject(enhancedError);
        }

        const startTime = Date.now();
        const parsedParams = this.parseParameters(parameters);
        const convertedQuery = this.convertMySQLToPostgreSQL(query);

        try {
            const client = await this.getClient();
            const result = await client.query(convertedQuery, parsedParams);
            client.release();

            const executionTime = Date.now() - startTime;
            this.queryCount++;

            if (executionTime > this.slowQueryThreshold) {
                console.warn(`^6NEONDB: ^7Slow query detected (${executionTime}ms) at ${callerInfo.location}:`, convertedQuery.substring(0, 100));
            }

            const rows = result.rows || [];
            if (callback) callback(rows);
            return rows;
        } catch (error) {
            const enhancedError = this.createEnhancedError(error, convertedQuery, parsedParams, callerInfo);
            this.logError(enhancedError, 'Query');
            if (callback) callback([]);
            return Promise.reject(enhancedError);
        }
    }

    async single(query, parameters = [], callback = null) {
        try {
            const result = await this.query(query, parameters);
            const row = result.length > 0 ? result[0] : null;
            if (callback) callback(row);
            return row;
        } catch (error) {
            if (callback) callback(null);
            return Promise.reject(error);
        }
    }

    async scalar(query, parameters = [], callback = null) {
        try {
            const result = await this.single(query, parameters);
            if (result) {
                const firstKey = Object.keys(result)[0];
                const value = result[firstKey];
                if (callback) callback(value);
                return value;
            }
            if (callback) callback(null);
            return null;
        } catch (error) {
            if (callback) callback(null);
            return Promise.reject(error);
        }
    }

    async insertQuery(query, parameters = [], callback = null) {
        try {
            let modifiedQuery = query;
            if (!modifiedQuery.toLowerCase().includes('returning')) {
                modifiedQuery += ' RETURNING id';
            }

            const result = await this.execute(modifiedQuery, parameters);
            const insertId = result.insertId;

            if (callback) callback(insertId);
            return insertId;
        } catch (error) {
            if (callback) callback(false);
            return Promise.reject(error);
        }
    }

    async updateQuery(query, parameters = [], callback = null) {
        try {
            const result = await this.execute(query, parameters);
            if (callback) callback(result.affectedRows);
            return result.affectedRows;
        } catch (error) {
            if (callback) callback(false);
            return Promise.reject(error);
        }
    }

    async transaction(queries, callback = null) {
        const callerInfo = this.getCallerInfo();

        if (!this.isReady) {
            const error = new Error('Database not ready');
            const enhancedError = this.createEnhancedError(error, 'TRANSACTION', queries, callerInfo);
            this.logError(enhancedError, 'Transaction');
            if (callback) callback(false, enhancedError.message);
            return Promise.reject(enhancedError);
        }

        const client = await this.getClient();
        const results = [];

        try {
            await client.query('BEGIN');

            for (const queryData of queries) {
                let query, parameters;

                if (typeof queryData === 'string') {
                    query = queryData;
                    parameters = [];
                } else if (Array.isArray(queryData)) {
                    query = queryData[0];
                    parameters = queryData[1] || [];
                } else {
                    query = queryData.query;
                    parameters = queryData.parameters || [];
                }

                const convertedQuery = this.convertMySQLToPostgreSQL(query);
                const parsedParams = this.parseParameters(parameters);
                const result = await client.query(convertedQuery, parsedParams);

                results.push({
                    affectedRows: result.rowCount || 0,
                    insertId: this.getInsertId(result),
                    warningCount: 0,
                    changedRows: result.rowCount || 0
                });
            }

            await client.query('COMMIT');
            if (callback) callback(results);
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            const enhancedError = this.createEnhancedError(error, 'TRANSACTION', queries, callerInfo);
            this.logError(enhancedError, 'Transaction');
            if (callback) callback(false, enhancedError.message);
            return Promise.reject(enhancedError);
        } finally {
            client.release();
        }
    }

    async prepare(name, query, callback = null) {
        const callerInfo = this.getCallerInfo();

        try {
            this.preparedStatements.set(name, this.convertMySQLToPostgreSQL(query));
            if (callback) callback(true);
            return true;
        } catch (error) {
            const enhancedError = this.createEnhancedError(error, query, [], callerInfo);
            this.logError(enhancedError, 'Prepare');
            if (callback) callback(false);
            return Promise.reject(enhancedError);
        }
    }

    ready(callback = null) {
        if (callback) {
            if (this.isReady) {
                callback(true);
            } else {
                const checkReady = () => {
                    if (this.isReady) {
                        callback(true);
                    } else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            }
        }
        return this.isReady;
    }

    getStatus() {
        return {
            ready: this.isReady,
            queryCount: this.queryCount,
            poolSize: this.pool ? this.pool.totalCount : 0,
            idleConnections: this.pool ? this.pool.idleCount : 0,
            waitingClients: this.pool ? this.pool.waitingCount : 0,
            coldStarts: this.metrics.coldStarts,
            reconnects: this.metrics.reconnects,
            lastConnectTime: this.metrics.lastConnectTime,
            batchingEnabled: this.batchingEnabled,
            warmupEnabled: this.warmupEnabled
        };
    }
}

// Initialize the database
const neondb = new NEONDB();

// Enhanced export functions with better error handling
function safeExecute(fn, name) {
    return function (...args) {
        try {
            return fn.apply(neondb, args);
        } catch (error) {
            console.error(`^1[NEONDB] ^7${name} failed:`, error.message);
            const callback = args[args.length - 1];
            if (typeof callback === 'function') {
                callback(false, error.message);
            }
            throw error;
        }
    };
}

// Export functions with enhanced error handling
global.exports('execute', safeExecute(neondb.execute.bind(neondb), 'execute'));
global.exports('query', safeExecute(neondb.query.bind(neondb), 'query'));
global.exports('single', safeExecute(neondb.single.bind(neondb), 'single'));
global.exports('scalar', safeExecute(neondb.scalar.bind(neondb), 'scalar'));
global.exports('insert', safeExecute(neondb.insertQuery.bind(neondb), 'insert'));
global.exports('update', safeExecute(neondb.updateQuery.bind(neondb), 'update'));
global.exports('prepare', safeExecute(neondb.prepare.bind(neondb), 'prepare'));
global.exports('transaction', safeExecute(neondb.transaction.bind(neondb), 'transaction'));
global.exports('ready', safeExecute(neondb.ready.bind(neondb), 'ready'));
global.exports('rawExecute', safeExecute(neondb.execute.bind(neondb), 'rawExecute'));
global.exports('rawQuery', safeExecute(neondb.query.bind(neondb), 'rawQuery'));
global.exports('store', safeExecute(neondb.prepare.bind(neondb), 'store'));

// Export SQL Builder functions
global.exports('select', safeExecute(neondb.select.bind(neondb), 'select'));
global.exports('insertInto', safeExecute(neondb.insert.bind(neondb), 'insertInto'));
global.exports('updateTable', safeExecute(neondb.update.bind(neondb), 'updateTable'));
global.exports('deleteFrom', safeExecute(neondb.delete.bind(neondb), 'deleteFrom'));
global.exports('createTable', safeExecute(neondb.createTable.bind(neondb), 'createTable'));
global.exports('dropTable', safeExecute(neondb.dropTable.bind(neondb), 'dropTable'));

global.exports('parseParameters', (parameters) => {
    return neondb.parseParameters(parameters);
});

// Status command
RegisterCommand('neondb:status', () => {
    const status = neondb.getStatus();
    console.log('^6NEONDB: ^7Status:', JSON.stringify(status, null, 2));
}, true);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('^6NEONDB: ^7Shutting down gracefully...');
    if (neondb.pool) {
        await neondb.pool.end();
    }
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('^1[NEONDB] ^7Unhandled Promise Rejection:', reason);
    if (reason && reason.callerInfo) {
        console.error(`^1[NEONDB] ^7Location: ${reason.callerInfo.location}`);
    }
});

console.log('^6NEONDB: ^7PostgreSQL wrapper loaded - waiting for database connection...');
