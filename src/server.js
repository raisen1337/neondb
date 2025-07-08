// src/server.js
const { Pool, Client } = require('pg');

class OxPgSQL {
    constructor() {
        this.pool = null;
        this.isReady = false;
        this.preparedStatements = new Map();
        this.connectionConfig = this.getConnectionConfig();
        this.queryCount = 0;
        this.slowQueryThreshold = GetConvarInt('pgsql_slow_query_warning', 100);
        this.debugMode = GetConvar('pgsql_debug', 'false') === 'true';
        this.booleanColumns = new Set(); // Cache for known boolean columns
        this.init();
    }

    getConnectionConfig() {
        const connectionString = GetConvar('pgsql_connection_string', '');

        if (connectionString) {
            return {
                connectionString: connectionString,
                max: GetConvarInt('pgsql_max_connections', 20),
                min: GetConvarInt('pgsql_min_connections', 5),
                idleTimeoutMillis: GetConvarInt('pgsql_idle_timeout', 30000),
                connectionTimeoutMillis: GetConvarInt('pgsql_connection_timeout', 10000),
                acquireTimeoutMillis: GetConvarInt('pgsql_acquire_timeout', 10000),
                ssl: GetConvar('pgsql_ssl', 'true') === 'true' ? { rejectUnauthorized: false } : false,
                statement_timeout: GetConvarInt('pgsql_statement_timeout', 60000),
                query_timeout: GetConvarInt('pgsql_query_timeout', 60000),
                application_name: 'FiveM-oxpgsql'
            };
        }

        return {
            host: GetConvar('pgsql_host', 'localhost'),
            port: GetConvarInt('pgsql_port', 5432),
            database: GetConvar('pgsql_database', 'fivem'),
            user: GetConvar('pgsql_user', 'postgres'),
            password: GetConvar('pgsql_password', ''),
            max: GetConvarInt('pgsql_max_connections', 20),
            min: GetConvarInt('pgsql_min_connections', 5),
            idleTimeoutMillis: GetConvarInt('pgsql_idle_timeout', 30000),
            connectionTimeoutMillis: GetConvarInt('pgsql_connection_timeout', 10000),
            acquireTimeoutMillis: GetConvarInt('pgsql_acquire_timeout', 10000),
            ssl: GetConvar('pgsql_ssl', 'true') === 'true' ? { rejectUnauthorized: false } : false,
            statement_timeout: GetConvarInt('pgsql_statement_timeout', 60000),
            query_timeout: GetConvarInt('pgsql_query_timeout', 60000),
            application_name: 'FiveM-oxpgsql'
        };
    }

    async init() {
        try {
            this.pool = new Pool(this.connectionConfig);

            // Test connection
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as server_time, version() as version');
            client.release();

            this.isReady = true;
            console.log('^6NEONDB: ^7Connected to PostgreSQL database successfully');
            console.log('^6NEONDB: ^7Server time:', result.rows[0].server_time);
            console.log('^6NEONDB: ^7PostgreSQL version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
            console.log('^6NEONDB: ^7Connection pool initialized with', this.connectionConfig.max, 'max connections');

            // Handle pool events
            this.pool.on('error', (err) => {
                console.error('^6NEONDB: ^7Pool error:', err.message);
            });

            this.pool.on('connect', (client) => {
                if (this.debugMode) {
                    console.log('^6NEONDB: ^7New client connected');
                }
            });

            this.pool.on('acquire', (client) => {
                if (this.debugMode) {
                    console.log('^6NEONDB: ^7Client acquired from pool');
                }
            });

            this.pool.on('remove', (client) => {
                if (this.debugMode) {
                    console.log('^6NEONDB: ^7Client removed from pool');
                }
            });

        } catch (error) {
            console.error('^6NEONDB: ^7Failed to connect to database:', error.message);
            this.isReady = false;
        }
    }

    parseParameters(parameters) {
        if (!parameters) return [];
        if (Array.isArray(parameters)) {
            return parameters; // Don't auto-convert parameters
        }
        if (typeof parameters === 'object') {
            return Object.values(parameters);
        }
        return [parameters];
    }

    // Common boolean column names that are likely to be boolean fields
    getBooleanColumnPatterns() {
        return [
            'enabled', 'enable', 'disabled', 'disable',
            'active', 'inactive', 'is_active', 'is_enabled',
            'visible', 'hidden', 'is_visible', 'is_hidden',
            'online', 'offline', 'is_online',
            'banned', 'is_banned', 'locked', 'is_locked',
            'verified', 'is_verified', 'approved', 'is_approved',
            'deleted', 'is_deleted', 'archived', 'is_archived',
            'public', 'private', 'is_public', 'is_private',
            'for_sale', 'available', 'is_available',
            'completed', 'is_completed', 'finished', 'is_finished',
            // Add more boolean column patterns here as needed
            'status', 'is_status', 'valid', 'is_valid',
            'paid', 'is_paid', 'processed', 'is_processed',
            'confirmed', 'is_confirmed', 'flagged', 'is_flagged',
            'subscribed', 'is_subscribed', 'premium', 'is_premium'
        ];
    }

    convertMySQLToPostgreSQL(query) {
        let convertedQuery = query;
        let paramIndex = 1;

        // Replace ? with $1, $2, etc.
        convertedQuery = convertedQuery.replace(/\?/g, () => `$${paramIndex++}`);

        // Convert MySQL specific functions to PostgreSQL
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
        convertedQuery = convertedQuery.replace(/TEXT/gi, 'TEXT');

        // Get boolean column patterns
        const booleanColumns = this.getBooleanColumnPatterns();
        const booleanPattern = `\\b(${booleanColumns.join('|')})\\b`;

        // CASE 1: Handle "column = 1" or "column = 0" by converting to "column::integer = 1/0"
        // This handles integer to boolean comparisons
        const equalsOneRegex = new RegExp(`${booleanPattern}\\s*=\\s*1\\b(?!\\d)`, 'gi');
        const equalsZeroRegex = new RegExp(`${booleanPattern}\\s*=\\s*0\\b(?!\\d)`, 'gi');
        const notEqualsOneRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*1\\b(?!\\d)`, 'gi');
        const notEqualsZeroRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*0\\b(?!\\d)`, 'gi');

        convertedQuery = convertedQuery.replace(equalsOneRegex, '$1::integer = 1');
        convertedQuery = convertedQuery.replace(equalsZeroRegex, '$1::integer = 0');
        convertedQuery = convertedQuery.replace(notEqualsOneRegex, '$1::integer != 1');
        convertedQuery = convertedQuery.replace(notEqualsZeroRegex, '$1::integer != 0');

        // CASE 2: Handle "column = true" or "column = false" by converting to "(column::integer)::boolean = true/false"
        // This handles boolean to integer comparisons
        const equalsTrueRegex = new RegExp(`${booleanPattern}\\s*=\\s*true\\b`, 'gi');
        const equalsFalseRegex = new RegExp(`${booleanPattern}\\s*=\\s*false\\b`, 'gi');
        const notEqualsTrueRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*true\\b`, 'gi');
        const notEqualsFalseRegex = new RegExp(`${booleanPattern}\\s*(?:!=|<>)\\s*false\\b`, 'gi');

        convertedQuery = convertedQuery.replace(equalsTrueRegex, '$1::integer = 1');
        convertedQuery = convertedQuery.replace(equalsFalseRegex, '$1::integer = 0');
        convertedQuery = convertedQuery.replace(notEqualsTrueRegex, '$1::integer != 1');
        convertedQuery = convertedQuery.replace(notEqualsFalseRegex, '$1::integer != 0');

        // Handle cases where true/false literals are used in other contexts
        // For example, in INSERT or UPDATE statements
        convertedQuery = convertedQuery.replace(/\b(VALUES\s*\([^)]*?),\s*true\b/gi, '$1, 1');
        convertedQuery = convertedQuery.replace(/\b(VALUES\s*\([^)]*?),\s*false\b/gi, '$1, 0');
        convertedQuery = convertedQuery.replace(/\bSET\s+([^=]+)\s*=\s*true\b/gi, 'SET $1 = 1');
        convertedQuery = convertedQuery.replace(/\bSET\s+([^=]+)\s*=\s*false\b/gi, 'SET $1 = 0');

        return convertedQuery;
    }

    async getTableInfo(tableName) {
        if (!this.tableInfoCache) {
            this.tableInfoCache = new Map();
        }

        // Check if we have cached info for this table
        if (this.tableInfoCache.has(tableName)) {
            return this.tableInfoCache.get(tableName);
        }

        try {
            // Query to get primary key column and if it's a serial/identity column
            const query = `
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
        `;

            const client = await this.pool.connect();
            const result = await client.query(query, [tableName]);
            client.release();

            const columns = {};
            let primaryKey = null;
            let hasIdentityColumn = false;

            for (const row of result.rows) {
                columns[row.column_name] = {
                    dataType: row.data_type,
                    notNull: row.not_null,
                    isPrimaryKey: row.is_primary_key,
                    defaultValue: row.default_value
                };

                // Check if this is a primary key with a default value (likely a serial/identity)
                if (row.is_primary_key && row.default_value) {
                    primaryKey = row.column_name;
                    // Check if default value contains nextval or similar sequence function
                    if (row.default_value.includes('nextval') ||
                        row.default_value.includes('identity')) {
                        hasIdentityColumn = true;
                    }
                }
            }

            const tableInfo = {
                columns,
                primaryKey,
                hasIdentityColumn
            };

            // Cache the result
            this.tableInfoCache.set(tableName, tableInfo);
            return tableInfo;
        } catch (error) {
            console.error(`^6NEONDB: ^7Failed to get table info for ${tableName}:`, error.message);
            return { columns: {}, primaryKey: null, hasIdentityColumn: false };
        }
    }
    async findSequenceForTable(tableName) {
        try {
            // Query to find sequences associated with a table's column
            const query = `
            SELECT pg_get_serial_sequence($1, 'id') AS sequence_name;
        `;

            const client = await this.pool.connect();
            const result = await client.query(query, [tableName]);
            client.release();

            if (result.rows && result.rows.length > 0 && result.rows[0].sequence_name) {
                return result.rows[0].sequence_name;
            }

            // If no sequence found, try a more general approach to find any sequence
            const fallbackQuery = `
            SELECT ns.nspname || '.' || seq.relname AS sequence_name
            FROM pg_class seq
            JOIN pg_namespace ns ON seq.relnamespace = ns.oid
            WHERE seq.relkind = 'S'
            AND seq.relname LIKE $1
            LIMIT 1;
        `;

            const client2 = await this.pool.connect();
            const result2 = await client2.query(fallbackQuery, [`%${tableName}%id%`]);
            client2.release();

            if (result2.rows && result2.rows.length > 0 && result2.rows[0].sequence_name) {
                return result2.rows[0].sequence_name;
            }

            return null;
        } catch (error) {
            console.error(`^6NEONDB: ^7Failed to find sequence for table ${tableName}:`, error.message);
            return null;
        }
    }
    async execute(query, parameters = [], callback = null) {
        if (!this.isReady) {
            const error = 'Database not ready';
            if (callback) callback(false, error);
            return Promise.reject(new Error(error));
        }

        const startTime = Date.now();
        const parsedParams = this.parseParameters(parameters);
        let convertedQuery = this.convertMySQLToPostgreSQL(query);

        // Check if this is an INSERT INTO inventory_items query missing the id column
        if (convertedQuery.includes('INSERT INTO inventory_items') &&
            !convertedQuery.includes('(id,') &&
            !convertedQuery.includes('(id ')) {

            // Extract column list and values
            const columnMatch = convertedQuery.match(/\(([^)]+)\)/);
            if (columnMatch) {
                const columns = columnMatch[1].trim();

                // Find VALUES clause
                const valuesMatch = convertedQuery.match(/VALUES\s*\(([^)]+)\)/i);
                if (valuesMatch) {
                    const values = valuesMatch[1].trim();

                    // Modify the query to include the id column with a generated value
                    convertedQuery = convertedQuery.replace(
                        `(${columns})`,
                        `(id, ${columns})`
                    );

                    // Replace VALUES clause with a modified one that includes a subquery for the ID
                    convertedQuery = convertedQuery.replace(
                        `VALUES (${values})`,
                        `VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM inventory_items), ${values})`
                    );

                    // Add RETURNING id if not present
                    if (!convertedQuery.toLowerCase().includes('returning')) {
                        convertedQuery += ' RETURNING id';
                    }

                    console.log('^6NEONDB: ^7Modified query to include id:', convertedQuery);
                }
            }
        }

        try {
            const client = await this.pool.connect();
            const result = await client.query(convertedQuery, parsedParams);
            client.release();

            const executionTime = Date.now() - startTime;
            this.queryCount++;

            if (executionTime > this.slowQueryThreshold) {
                console.warn(`^6NEONDB: ^7Slow query detected (${executionTime}ms):`, convertedQuery.substring(0, 100));
            }

            if (this.debugMode) {
                console.log(`^6NEONDB: ^7Query executed in ${executionTime}ms:`, convertedQuery.substring(0, 100));
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
            console.error('^6NEONDB: ^7Execute error:', error.message);
            console.error('^6NEONDB: ^7Query:', convertedQuery);
            console.error('^6NEONDB: ^7Parameters:', parsedParams);

            // Handle the specific inventory_items ID constraint violation
            if (error.message.includes('violates not-null constraint') &&
                error.message.includes('column "id"') &&
                convertedQuery.includes('INSERT INTO inventory_items')) {

                try {
                    // Create a completely new query with an explicit ID
                    const fixedQuery = `
                    INSERT INTO inventory_items 
                    (id, name, label, description, inventory_identifier, slot, amount, metadata) 
                    VALUES 
                    ((SELECT COALESCE(MAX(id), 0) + 1 FROM inventory_items), $1, $2, $3, $4, $5, $6, $7)
                    RETURNING id
                `;

                    const client = await this.pool.connect();
                    const result = await client.query(fixedQuery, parsedParams);
                    client.release();

                    const response = {
                        affectedRows: result.rowCount || 0,
                        insertId: result.rows[0].id,
                        warningCount: 0,
                        changedRows: result.rowCount || 0,
                        fieldCount: result.fields ? result.fields.length : 0,
                        serverStatus: 2,
                        info: '',
                        executionTime: Date.now() - startTime
                    };

                    console.log('^6NEONDB: ^7Auto-fixed inventory_items INSERT query');

                    if (callback) callback(response);
                    return response;
                } catch (retryError) {
                    console.error('^6NEONDB: ^7Failed to auto-fix inventory_items INSERT query:', retryError.message);

                    // Last resort - try with a random ID
                    try {
                        const randomId = Math.floor(1000000 + Math.random() * 8999999);
                        const lastResortQuery = `
                        INSERT INTO inventory_items 
                        (id, name, label, description, inventory_identifier, slot, amount, metadata) 
                        VALUES 
                        (${randomId}, $1, $2, $3, $4, $5, $6, $7)
                        RETURNING id
                    `;

                        const client = await this.pool.connect();
                        const result = await client.query(lastResortQuery, parsedParams);
                        client.release();

                        const response = {
                            affectedRows: result.rowCount || 0,
                            insertId: result.rows[0].id,
                            warningCount: 0,
                            changedRows: result.rowCount || 0,
                            fieldCount: result.fields ? result.fields.length : 0,
                            serverStatus: 2,
                            info: '',
                            executionTime: Date.now() - startTime
                        };

                        console.log(`^6NEONDB: ^7Auto-fixed inventory_items INSERT query with random ID ${randomId}`);

                        if (callback) callback(response);
                        return response;
                    } catch (finalError) {
                        console.error('^6NEONDB: ^7All attempts to fix inventory_items INSERT query failed:', finalError.message);
                    }
                }
            }

            if (callback) callback(false, error.message);
            return Promise.reject(error);
        }
    }


    async rawExecute(query, parameters = [], callback = null) {
        if (!this.isReady) {
            const error = 'Database not ready';
            if (callback) callback(false, error);
            return Promise.reject(new Error(error));
        }

        const startTime = Date.now();
        const parsedParams = this.parseParameters(parameters);

        try {
            const client = await this.pool.connect();
            const result = await client.query(query, parsedParams);
            client.release();

            const executionTime = Date.now() - startTime;
            this.queryCount++;

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
            console.error('^6NEONDB: ^7Raw execute error:', error.message);
            if (callback) callback(false, error.message);
            return Promise.reject(error);
        }
    }

    async query(query, parameters = [], callback = null) {
        if (!this.isReady) {
            const error = 'Database not ready';
            if (callback) callback([]);
            return Promise.reject(new Error(error));
        }

        const startTime = Date.now();
        const parsedParams = this.parseParameters(parameters);
        const convertedQuery = this.convertMySQLToPostgreSQL(query);

        try {
            const client = await this.pool.connect();
            const result = await client.query(convertedQuery, parsedParams);
            client.release();

            const executionTime = Date.now() - startTime;
            this.queryCount++;

            if (executionTime > this.slowQueryThreshold) {
                console.warn(`^6NEONDB: ^7Slow query detected (${executionTime}ms):`, convertedQuery.substring(0, 100));
            }

            if (this.debugMode) {
                console.log(`^6NEONDB: ^7Query executed in ${executionTime}ms:`, convertedQuery.substring(0, 100));
            }

            const rows = result.rows || [];
            if (callback) callback(rows);
            return rows;
        } catch (error) {
            console.error('^6NEONDB: ^7Query error:', error.message);
            console.error('^6NEONDB: ^7Query:', convertedQuery);
            console.error('^6NEONDB: ^7Parameters:', parsedParams);

            if (callback) callback([]);
            return Promise.reject(error);
        }
    }

    async rawQuery(query, parameters = [], callback = null) {
        if (!this.isReady) {
            const error = 'Database not ready';
            if (callback) callback([]);
            return Promise.reject(new Error(error));
        }

        const startTime = Date.now();
        const parsedParams = this.parseParameters(parameters);

        try {
            const client = await this.pool.connect();
            const result = await client.query(query, parsedParams);
            client.release();

            const executionTime = Date.now() - startTime;
            this.queryCount++;

            const rows = result.rows || [];
            if (callback) callback(rows);
            return rows;
        } catch (error) {
            console.error('^6NEONDB: ^7Raw query error:', error.message);
            if (callback) callback([]);
            return Promise.reject(error);
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

    async insert(query, parameters = [], callback = null) {
        try {
            let modifiedQuery = query;

            // Make sure RETURNING id is added
            if (!modifiedQuery.toLowerCase().includes('returning')) {
                modifiedQuery += ' RETURNING id';
            }

            const result = await this.execute(modifiedQuery, parameters);
            const insertId = result.insertId;

            if (callback) callback(insertId);
            return insertId;
        } catch (error) {
            // Special handling for ID constraint violation
            if (error.message && error.message.includes('violates not-null constraint') &&
                error.message.includes('column "id"')) {

                try {
                    const tableNameMatch = query.match(/^\s*INSERT\s+INTO\s+([^\s(]+)/i);
                    if (tableNameMatch) {
                        const tableName = tableNameMatch[1].replace(/"/g, '').replace(/`/g, '');

                        // First, get the maximum ID from the table
                        const client = await this.pool.connect();
                        const maxIdResult = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM ${tableName}`);
                        const nextId = maxIdResult.rows[0].next_id;

                        // Extract column list
                        const columnMatch = query.match(/\(([^)]+)\)/);
                        if (columnMatch) {
                            const columns = columnMatch[1].trim();

                            // Create a new query with explicit ID
                            const modifiedQuery = `
                            INSERT INTO ${tableName} 
                            (id, ${columns}) 
                            VALUES 
                            (${nextId}, ${this.parseParameters(parameters).map((_, i) => `$${i + 1}`).join(', ')})
                            RETURNING id
                        `;

                            const result = await client.query(modifiedQuery, this.parseParameters(parameters));
                            client.release();

                            const insertId = result.rows[0].id || nextId;
                            console.log(`^6NEONDB: ^7Auto-fixed INSERT query using MAX(id)+1 = ${nextId}`);

                            if (callback) callback(insertId);
                            return insertId;
                        }
                    }
                } catch (retryError) {
                    console.error('^6NEONDB: ^7Failed to auto-fix INSERT query:', retryError.message);
                }
            }

            if (callback) callback(false);
            return Promise.reject(error);
        }
    }

    async update(query, parameters = [], callback = null) {
        try {
            const result = await this.execute(query, parameters);
            const affectedRows = result.affectedRows;

            if (callback) callback(affectedRows);
            return affectedRows;
        } catch (error) {
            if (callback) callback(false);
            return Promise.reject(error);
        }
    }

    async prepare(name, query, callback = null) {
        try {
            const convertedQuery = this.convertMySQLToPostgreSQL(query);
            this.preparedStatements.set(name, convertedQuery);

            if (callback) callback(true);
            return true;
        } catch (error) {
            console.error('^6NEONDB: ^7Prepare error:', error.message);
            if (callback) callback(false);
            return Promise.reject(error);
        }
    }

    async transaction(queries, callback = null) {
        if (!this.isReady) {
            const error = 'Database not ready';
            if (callback) callback(false, error);
            return Promise.reject(new Error(error));
        }

        const client = await this.pool.connect();
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
            client.release();

            if (callback) callback(results);
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            client.release();

            console.error('^6NEONDB: ^7Transaction error:', error.message);
            if (callback) callback(false, error.message);
            return Promise.reject(error);
        }
    }

    async store(name, query, parameters = [], callback = null) {
        try {
            this.preparedStatements.set(name, {
                query: this.convertMySQLToPostgreSQL(query),
                parameters: this.parseParameters(parameters)
            });

            if (callback) callback(true);
            return true;
        } catch (error) {
            console.error('^6NEONDB: ^7Store error:', error.message);
            if (callback) callback(false);
            return Promise.reject(error);
        }
    }
    getBooleanColumnPatterns() {
        return [
            'enabled', 'enable', 'disabled', 'disable',
            'active', 'inactive', 'is_active', 'is_enabled',
            'visible', 'hidden', 'is_visible', 'is_hidden',
            'online', 'offline', 'is_online',
            'banned', 'is_banned', 'locked', 'is_locked',
            'verified', 'is_verified', 'approved', 'is_approved',
            'deleted', 'is_deleted', 'archived', 'is_archived',
            'public', 'private', 'is_public', 'is_private',
            'for_sale', 'available', 'is_available',
            'completed', 'is_completed', 'finished', 'is_finished'
        ];
    }
    getInsertId(result) {
        if (result.rows && result.rows.length > 0) {
            const row = result.rows[0];
            // Check for common ID column names
            if (row.id !== undefined) return row.id;
            if (row.ID !== undefined) return row.ID;
            if (row.Id !== undefined) return row.Id;
            if (row.insertid !== undefined) return row.insertid;
            if (row.insertId !== undefined) return row.insertId;
            if (row.insert_id !== undefined) return row.insert_id;
            if (row.lastval !== undefined) return row.lastval;

            // If we can't find a specific ID column, return the first column's value
            const firstKey = Object.keys(row)[0];
            return row[firstKey];
        }
        return null;
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
            waitingClients: this.pool ? this.pool.waitingCount : 0
        };
    }
}

// Initialize the database
const oxpgsql = new OxPgSQL();

// Export functions
global.exports('execute', (query, parameters, callback) => {
    oxpgsql.execute(query, parameters, callback);
});

global.exports('query', (query, parameters, callback) => {
    oxpgsql.query(query, parameters, callback);
});

global.exports('single', (query, parameters, callback) => {
    oxpgsql.single(query, parameters, callback);
});

global.exports('scalar', (query, parameters, callback) => {
    oxpgsql.scalar(query, parameters, callback);
});

global.exports('insert', (query, parameters, callback) => {
    oxpgsql.insert(query, parameters, callback);
});

global.exports('update', (query, parameters, callback) => {
    oxpgsql.update(query, parameters, callback);
});

global.exports('prepare', (name, query, callback) => {
    oxpgsql.prepare(name, query, callback);
});

global.exports('transaction', (queries, callback) => {
    oxpgsql.transaction(queries, callback);
});

global.exports('ready', (callback) => {
    oxpgsql.ready(callback);
});

global.exports('rawExecute', (query, parameters, callback) => {
    oxpgsql.rawExecute(query, parameters, callback);
});

global.exports('rawQuery', (query, parameters, callback) => {
    oxpgsql.rawQuery(query, parameters, callback);
});

global.exports('store', (name, query, parameters, callback) => {
    oxpgsql.store(name, query, parameters, callback);
});

global.exports('parseParameters', (parameters) => {
    return oxpgsql.parseParameters(parameters);
});

// Status command
RegisterCommand('oxpgsql:status', () => {
    const status = oxpgsql.getStatus();
    console.log('^6NEONDB: ^7Status:', JSON.stringify(status, null, 2));
}, true);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('^6NEONDB: ^7Shutting down gracefully...');
    if (oxpgsql.pool) {
        await oxpgsql.pool.end();
    }
    process.exit(0);
});

function fixBooleanQuery(query) {
    // Replace integer comparisons with boolean comparisons
    return query
        .replace(/\b(\w+)\s*=\s*1\b(?!\d)/g, '$1 = true')
        .replace(/\b(\w+)\s*=\s*0\b(?!\d)/g, '$1 = false');
}
console.log('^6NEONDB: ^7PostgreSQL wrapper loaded - waiting for database connection...');
