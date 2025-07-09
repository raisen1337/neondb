# 🚀 NeonDB - Advanced PostgreSQL Database Wrapper for FiveM

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![FiveM](https://img.shields.io/badge/FiveM-Compatible-green.svg)](https://fivem.net/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://postgresql.org/)
[![Build](https://img.shields.io/badge/Build-Production%20Ready-success.svg)](dist/)

> 🔥 **The most advanced PostgreSQL database wrapper for FiveM servers**, engineered for enterprise-scale performance with seamless MySQL migration and intelligent error recovery.

## ✨ Core Features

### 🔄 **Intelligent MySQL Migration Engine**
- **Zero-Code Migration** - Drop-in replacement for oxmysql with 100% compatibility
- **Advanced Query Translation** - Seamlessly converts MySQL syntax to PostgreSQL
- **Smart Parameter Mapping** - Automatic `?` to `$1, $2, $3...` conversion
- **Data Type Intelligence** - Auto-converts `TINYINT(1)` → `BOOLEAN`, `DATETIME` → `TIMESTAMP`
- **Function Translation** - Handles `UNIX_TIMESTAMP()`, `FROM_UNIXTIME()`, and more

### 🚀 **Performance & Reliability Engine**
- **Dynamic Connection Pooling** - Self-optimizing pool with automatic scaling
- **Cold Start Recovery** - Intelligent warmup system for optimal performance
- **Query Batching System** - Groups operations for maximum throughput
- **Performance Monitoring** - Real-time metrics and slow query detection
- **Storage Analytics** - Built-in database storage monitoring and optimization

### �️ **Enterprise Error Handling**
- **Intelligent Error Recovery** - Automatic retry logic with exponential backoff
- **Auto ID Management** - Smart handling of primary key conflicts and generation
- **Constraint Violation Recovery** - Automatic fallbacks for common database errors
- **Enhanced Stack Traces** - FiveM-specific error reporting with caller information
- **Graceful Degradation** - Continues operation during temporary database issues

### 🔧 **Developer Experience**
- **SQL Builder API** - Intuitive query building with fluent interface
- **Debug Mode** - Comprehensive logging with query analysis
- **Status Monitoring** - Real-time connection pool and performance metrics
- **TypeScript Support** - Full type definitions for enhanced development
- **Hot Reload** - Development mode with automatic code reloading

## 📋 Requirements

- **FiveM Server** - Latest artifact recommended (minimum: b2699)
- **PostgreSQL Database** - Version 13+ required
- **Node.js Runtime** - Built into FiveM (no manual installation required)
- **Memory** - Minimum 512MB available RAM
- **Network** - Stable database connection (local or remote)

## 🛠️ Quick Installation

### **Method 1: Direct Download (Recommended)**
```bash
# 1. Download and extract to your resources folder
# 2. Ensure the folder is named 'neondb'
# 3. Add to server.cfg
start neondb
```

### **Method 2: Build from Source**
```bash
# Clone and build
git clone https://github.com/raisen1337/neondb.git
cd neondb
npm install
npm run build
```

## ⚙️ Configuration

Configure your database connection using convars in your `server.cfg`:

### **Database Connection**
```bash
# Option 1: Connection String (Recommended for NeonDB/Vercel Postgres)
set pgsql_connection_string "postgresql://username:password@hostname:5432/database?sslmode=require"

# Option 2: Individual Parameters
set pgsql_host "localhost"
set pgsql_port 5432
set pgsql_database "fivem"
set pgsql_user "postgres"
set pgsql_password "your_password"
```

### **Performance Optimization**
```bash
# Connection Pool Settings
set pgsql_max_connections 25          # Maximum concurrent connections
set pgsql_min_connections 5           # Minimum pool size
set pgsql_idle_timeout 30000          # Idle connection timeout (ms)
set pgsql_connection_timeout 10000    # Connection establishment timeout
set pgsql_acquire_timeout 10000       # Client acquisition timeout

# Query Performance
set pgsql_slow_query_warning 150      # Log queries slower than 150ms
set pgsql_statement_timeout 60000     # Query timeout (ms)
set pgsql_query_timeout 60000         # Overall query timeout

# Batching & Optimization
set pgsql_enable_batching true         # Enable query batching
set pgsql_batch_max_size 10           # Maximum queries per batch
set pgsql_batch_timeout 50            # Batch timeout in milliseconds

# Connection Warmup
set pgsql_enable_warmup true          # Enable connection warmup
set pgsql_warmup_frequency 300000     # Warmup interval (5 minutes)
```

### **Security & SSL**
```bash
set pgsql_ssl true                    # Enable SSL connections
set pgsql_debug false                 # Debug mode (development only)
```

### **Advanced Retry Logic**
```bash
set pgsql_max_retries 5               # Maximum retry attempts
set pgsql_retry_delay 100             # Initial retry delay (ms)
set pgsql_max_retry_delay 5000        # Maximum retry delay (ms)
```

## 📖 API Reference

### 🔍 **Query Functions**

#### `query(sql, parameters, callback)`
Execute a SELECT query and return all rows with enhanced error handling.

```lua
exports.neondb:query('SELECT * FROM users WHERE age > ? AND active = ?', {25, true}, function(result)
    for i = 1, #result do
        print('User: ' .. result[i].name .. ' (ID: ' .. result[i].id .. ')')
    end
end)
```

#### `single(sql, parameters, callback)`
Execute a query and return only the first row.

```lua
exports.neondb:single('SELECT * FROM users WHERE id = ?', {123}, function(user)
    if user then
        print('Found user: ' .. user.name .. ' with balance: $' .. user.money)
    else
        print('User not found')
    end
end)
```

#### `scalar(sql, parameters, callback)`
Execute a query and return a single value (first column of first row).

```lua
exports.neondb:scalar('SELECT COUNT(*) FROM users WHERE online = true', {}, function(count)
    print('Online users: ' .. count)
end)
```

### 🔧 **Execution Functions**

#### `execute(sql, parameters, callback)`
Execute INSERT, UPDATE, or DELETE queries with comprehensive result information.

```lua
exports.neondb:execute('UPDATE users SET money = ?, last_login = NOW() WHERE id = ?', 
    {5000, 123}, function(result)
    if result then
        print('Updated ' .. result.affectedRows .. ' rows in ' .. result.executionTime .. 'ms')
    end
end)
```

#### `insert(sql, parameters, callback)`
Execute INSERT queries with automatic ID return and conflict resolution.

```lua
exports.neondb:insert('INSERT INTO users (name, identifier, money, job) VALUES (?, ?, ?, ?)', 
    {'John Doe', 'steam:110000123456789', 5000, 'civilian'}, function(insertId)
    if insertId then
        print('Created user with ID: ' .. insertId)
    end
end)
```

#### `update(sql, parameters, callback)`
Execute UPDATE queries with affected row count.

```lua
exports.neondb:update('UPDATE users SET last_login = NOW() WHERE identifier = ?', 
    {'steam:110000123456789'}, function(affectedRows)
    print('Updated ' .. affectedRows .. ' user records')
end)
```

### 🔄 **Transaction Support**

#### `transaction(queries, callback)`
Execute multiple queries in a single ACID transaction with automatic rollback on failure.

```lua
-- Transfer money between players safely
local queries = {
    {'UPDATE users SET money = money - ? WHERE id = ? AND money >= ?', {1000, fromPlayerId, 1000}},
    {'UPDATE users SET money = money + ? WHERE id = ?', {1000, toPlayerId}},
    {'INSERT INTO transaction_log (from_user, to_user, amount, type, timestamp) VALUES (?, ?, ?, ?, NOW())', 
     {fromPlayerId, toPlayerId, 1000, 'transfer'}}
}

exports.neondb:transaction(queries, function(results)
    if results then
        print('Money transfer completed successfully')
        TriggerClientEvent('banking:transferSuccess', fromPlayer, toPlayer, 1000)
    else
        print('Transfer failed - insufficient funds or error')
        TriggerClientEvent('banking:transferFailed', fromPlayer, 'Transaction failed')
    end
end)
```

### 🏪 **Prepared Statements**

#### `prepare(name, sql, callback)`
Prepare a statement for optimized repeated execution.

```lua
exports.neondb:prepare('get_user_by_id', 'SELECT * FROM users WHERE id = ?', function(success)
    if success then
        print('Statement prepared successfully')
    end
end)
```

#### `store(name, sql, parameters, callback)`
Store a prepared statement with default parameters (alias for `prepare`).

```lua
exports.neondb:store('update_user_money', 'UPDATE users SET money = ? WHERE id = ?', {}, function(success)
    print('Money update statement stored: ' .. tostring(success))
end)
```

### 🧪 **Raw Query Functions**

#### `rawQuery(sql, parameters, callback)`
Execute raw PostgreSQL queries without MySQL conversion (for advanced operations).

```lua
exports.neondb:rawQuery('SELECT NOW() as server_time, version() as pg_version', {}, function(result)
    if result[1] then
        print('Server time: ' .. result[1].server_time)
        print('PostgreSQL version: ' .. result[1].pg_version)
    end
end)
```

#### `rawExecute(sql, parameters, callback)`
Execute raw PostgreSQL commands without MySQL conversion.

```lua
exports.neondb:rawExecute('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_identifier ON users(identifier)', 
    {}, function(result)
    print('Index creation completed: ' .. (result and 'success' or 'failed'))
end)
```

### 🔨 **SQL Builder API**

#### `select(table, columns, where, orderBy, limit)`
Fluent interface for building SELECT queries.

```lua
-- Get top 10 richest players
exports.neondb:select('users', {'name', 'money'}, 'banned = false', 'money DESC', 10):thenCall(function(players)
    for i, player in ipairs(players) do
        print(i .. '. ' .. player.name .. ': $' .. player.money)
    end
end)
```

#### `insertInto(table, data)`
Builder for INSERT operations with automatic parameter handling.

```lua
exports.neondb:insertInto('vehicles', {
    owner = 'steam:110000123456789',
    model = 'adder',
    plate = 'ABC123',
    garage = 'legion'
}):thenCall(function(result)
    print('Vehicle inserted with ID: ' .. result.insertId)
end)
```

#### `updateTable(table, data, where)`
Builder for UPDATE operations.

```lua
exports.neondb:updateTable('users', 
    {money = 10000, last_login = 'NOW()'}, 
    {identifier = 'steam:110000123456789'}
):thenCall(function(result)
    print('Updated user: ' .. result.affectedRows .. ' rows')
end)
```

#### `deleteFrom(table, where)`
Builder for DELETE operations.

```lua
exports.neondb:deleteFrom('vehicles', {owner = 'steam:110000123456789', sold = true}):thenCall(function(result)
    print('Deleted ' .. result.affectedRows .. ' sold vehicles')
end)
```

#### `createTable(tableName, columns, options)`
Create tables with PostgreSQL-optimized schema.

```lua
exports.neondb:createTable('player_stats', {
    id = 'SERIAL PRIMARY KEY',
    player_id = 'INTEGER NOT NULL',
    stat_name = 'VARCHAR(50) NOT NULL',
    stat_value = 'INTEGER DEFAULT 0',
    updated_at = 'TIMESTAMP DEFAULT NOW()'
}, {ifNotExists = true})
```

#### `dropTable(tableName, ifExists)`
Drop tables safely.

```lua
exports.neondb:dropTable('old_player_data', true)
```

### ⚡ **Utility Functions**

#### `ready(callback)`
Check database connection status with health monitoring.

```lua
exports.neondb:ready(function(isReady)
    if isReady then
        print('Database is ready and healthy!')
        -- Initialize your database-dependent systems
        InitializePlayerSystem()
        InitializeVehicleSystem()
    else
        print('Database not ready, retrying...')
    end
end)
```

#### `getStatus()`
Get comprehensive database status and performance metrics.

```lua
RegisterCommand('dbstatus', function(source, args, rawCommand)
    local status = exports.neondb:getStatus()
    print('=== NeonDB Status ===')
    print('Ready: ' .. tostring(status.ready))
    print('Query Count: ' .. status.queryCount)
    print('Pool Size: ' .. status.poolSize)
    print('Idle Connections: ' .. status.idleConnections)
    print('Cold Starts: ' .. status.coldStarts)
    print('Batching Enabled: ' .. tostring(status.batchingEnabled))
end, true)
```

## 💡 Real-World Usage Examples

### 🎮 **Enhanced Player Management System**

```lua
-- Advanced player creation with error handling
function CreatePlayer(name, identifier, startingData)
    exports.neondb:transaction({
        {
            'INSERT INTO users (name, identifier, money, bank, job, metadata) VALUES (?, ?, ?, ?, ?, ?)',
            {name, identifier, startingData.money or 5000, startingData.bank or 10000, 
             startingData.job or 'unemployed', json.encode(startingData.metadata or {})}
        },
        {
            'INSERT INTO player_stats (player_identifier, playtime, level) VALUES (?, ?, ?)',
            {identifier, 0, 1}
        },
        {
            'INSERT INTO player_inventory (identifier) VALUES (?)',
            {identifier}
        }
    }, function(results)
        if results then
            print('Player created successfully with full profile')
            TriggerClientEvent('player:created', -1, identifier, results[1].insertId)
        else
            print('Failed to create player - database error')
        end
    end)
end

-- Get comprehensive player data
function GetPlayerProfile(identifier, callback)
    exports.neondb:query([[
        SELECT 
            u.*,
            ps.playtime,
            ps.level,
            pi.items
        FROM users u
        LEFT JOIN player_stats ps ON u.identifier = ps.player_identifier
        LEFT JOIN (
            SELECT identifier, json_agg(json_build_object('name', item_name, 'count', count, 'metadata', metadata)) as items
            FROM player_inventory_items 
            WHERE identifier = ?
            GROUP BY identifier
        ) pi ON u.identifier = pi.identifier
        WHERE u.identifier = ?
    ]], {identifier, identifier}, callback)
end

-- Update player money with transaction safety
function UpdatePlayerMoney(identifier, amount, type)
    exports.neondb:transaction({
        {
            'UPDATE users SET money = ?, updated_at = NOW() WHERE identifier = ? AND money + ? >= 0',
            {amount, identifier, amount}
        },
        {
            'INSERT INTO money_transactions (player_identifier, amount, transaction_type, timestamp) VALUES (?, ?, ?, NOW())',
            {identifier, amount, type}
        }
    }, function(results)
        if results and results[1].affectedRows > 0 then
            TriggerClientEvent('player:moneyUpdated', GetPlayerFromIdentifier(identifier), amount)
        else
            print('Money update failed - insufficient funds or player not found')
        end
    end)
end
```

### 🏠 **Advanced Property System**

```lua
-- Complete property purchase system
function PurchaseProperty(playerId, propertyId, price)
    local playerIdentifier = GetPlayerIdentifier(playerId, 0)
    
    exports.neondb:transaction({
        -- Check and deduct money
        {
            'UPDATE users SET money = money - ? WHERE identifier = ? AND money >= ?',
            {price, playerIdentifier, price}
        },
        -- Claim property
        {
            'UPDATE properties SET owner_identifier = ?, purchased_at = NOW(), owned = true WHERE id = ? AND owned = false',
            {playerIdentifier, propertyId}
        },
        -- Create ownership record
        {
            'INSERT INTO property_ownership (player_identifier, property_id, purchase_price, purchase_date) VALUES (?, ?, ?, NOW())',
            {playerIdentifier, propertyId, price}
        },
        -- Log transaction
        {
            'INSERT INTO transaction_log (player_identifier, type, amount, description) VALUES (?, ?, ?, ?)',
            {playerIdentifier, 'property_purchase', -price, 'Property ID: ' .. propertyId}
        }
    }, function(results)
        if results and results[1].affectedRows > 0 and results[2].affectedRows > 0 then
            print('Property purchased successfully!')
            TriggerClientEvent('property:purchased', playerId, propertyId)
            TriggerClientEvent('player:moneyUpdated', playerId, -price)
        else
            TriggerClientEvent('property:purchaseFailed', playerId, 'Insufficient funds or property unavailable')
        end
    end)
end

-- Get player properties with details
function GetPlayerProperties(identifier, callback)
    exports.neondb:query([[
        SELECT 
            p.*,
            po.purchase_price,
            po.purchase_date,
            COALESCE(pi.total_value, 0) as interior_value
        FROM properties p
        JOIN property_ownership po ON p.id = po.property_id
        LEFT JOIN (
            SELECT property_id, SUM(value) as total_value
            FROM property_items
            GROUP BY property_id
        ) pi ON p.id = pi.property_id
        WHERE p.owner_identifier = ?
        ORDER BY po.purchase_date DESC
    ]], {identifier}, callback)
end
```

### 📦 **High-Performance Inventory System**

```lua
-- Optimized inventory operations
function AddItemToInventory(identifier, itemName, amount, metadata, callback)
    -- Use upsert pattern for efficiency
    exports.neondb:execute([[
        INSERT INTO inventory_items (identifier, item_name, amount, metadata, updated_at)
        VALUES (?, ?, ?, ?, NOW())
        ON CONFLICT (identifier, item_name)
        DO UPDATE SET 
            amount = inventory_items.amount + EXCLUDED.amount,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING id, amount
    ]], {identifier, itemName, amount, json.encode(metadata or {})}, function(result)
        if result and result.insertId then
            callback(true, result.insertId, result.amount)
            TriggerClientEvent('inventory:itemAdded', GetPlayerFromIdentifier(identifier), itemName, amount)
        else
            callback(false)
        end
    end)
end

-- Get inventory with metadata parsing
function GetPlayerInventory(identifier, callback)
    exports.neondb:query([[
        SELECT 
            item_name,
            amount,
            metadata::json as parsed_metadata,
            updated_at
        FROM inventory_items 
        WHERE identifier = ? AND amount > 0
        ORDER BY updated_at DESC
    ]], {identifier}, function(items)
        -- Process metadata
        for _, item in ipairs(items) do
            item.metadata = item.parsed_metadata
            item.parsed_metadata = nil
        end
        callback(items)
    end)
end

-- Batch inventory update for performance
function UpdateInventoryBatch(updates, callback)
    local queries = {}
    for _, update in ipairs(updates) do
        table.insert(queries, {
            'UPDATE inventory_items SET amount = ?, updated_at = NOW() WHERE identifier = ? AND item_name = ?',
            {update.amount, update.identifier, update.item_name}
        })
    end
    
    exports.neondb:transaction(queries, callback)
end
```

### 📊 **Analytics & Leaderboards**

```lua
-- Advanced leaderboard queries
function GetLeaderboards(type, limit, callback)
    local queries = {
        money = [[
            SELECT name, money, 
                   RANK() OVER (ORDER BY money DESC) as rank
            FROM users 
            WHERE banned = false 
            ORDER BY money DESC 
            LIMIT ?
        ]],
        playtime = [[
            SELECT u.name, ps.playtime,
                   RANK() OVER (ORDER BY ps.playtime DESC) as rank
            FROM users u
            JOIN player_stats ps ON u.identifier = ps.player_identifier
            WHERE u.banned = false
            ORDER BY ps.playtime DESC
            LIMIT ?
        ]],
        level = [[
            SELECT u.name, ps.level, ps.experience,
                   RANK() OVER (ORDER BY ps.level DESC, ps.experience DESC) as rank
            FROM users u
            JOIN player_stats ps ON u.identifier = ps.player_identifier
            WHERE u.banned = false
            ORDER BY ps.level DESC, ps.experience DESC
            LIMIT ?
        ]]
    }
    
    if queries[type] then
        exports.neondb:query(queries[type], {limit}, callback)
    else
        callback({})
    end
end

-- Server analytics
function GetServerAnalytics(callback)
    exports.neondb:query([[
        SELECT 
            (SELECT COUNT(*) FROM users) as total_players,
            (SELECT COUNT(*) FROM users WHERE banned = false) as active_players,
            (SELECT AVG(money)::INTEGER FROM users WHERE banned = false) as avg_money,
            (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '7 days') as weekly_active,
            (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '24 hours') as daily_active,
            (SELECT SUM(amount) FROM money_transactions WHERE created_at > NOW() - INTERVAL '24 hours') as daily_transactions
    ]], {}, function(stats)
        callback(stats[1])
    end)
end
```

### 🎯 **Performance Monitoring Commands**

```lua
-- Status monitoring command
RegisterCommand('neondb:status', function(source, args, rawCommand)
    local status = exports.neondb:getStatus()
    
    print('^6=== NeonDB Performance Status ===^7')
    print('Database Ready: ' .. (status.ready and '^2YES^7' or '^1NO^7'))
    print('Total Queries: ^3' .. status.queryCount .. '^7')
    print('Active Connections: ^3' .. status.poolSize .. '^7')
    print('Idle Connections: ^3' .. status.idleConnections .. '^7')
    print('Waiting Clients: ^3' .. status.waitingClients .. '^7')
    print('Cold Starts: ^3' .. status.coldStarts .. '^7')
    print('Reconnects: ^3' .. status.reconnects .. '^7')
    print('Batching: ' .. (status.batchingEnabled and '^2ENABLED^7' or '^1DISABLED^7'))
    print('Warmup: ' .. (status.warmupEnabled and '^2ENABLED^7' or '^1DISABLED^7'))
end, true)

-- Database health check
RegisterCommand('neondb:health', function(source, args, rawCommand)
    exports.neondb:rawQuery('SELECT NOW() as current_time, version() as pg_version', {}, function(result)
        if result and result[1] then
            print('^2Database Health: GOOD^7')
            print('Server Time: ^3' .. result[1].current_time .. '^7')
            print('PostgreSQL Version: ^3' .. result[1].pg_version .. '^7')
        else
            print('^1Database Health: FAILED^7')
        end
    end)
end, true)
```

## 🔧 Advanced Features & Optimizations

### 🎯 **Intelligent Boolean Column Handling**

NeonDB automatically detects and handles boolean conversions for common column patterns:

```lua
-- These MySQL-style queries work automatically
exports.neondb:query('SELECT * FROM users WHERE active = 1 AND verified = true', {}, function(users)
    -- Automatically converts: active::integer = 1 AND verified::integer = 1
end)

exports.neondb:execute('UPDATE properties SET for_sale = 0, visible = false WHERE id = ?', {123}, function(result)
    -- Automatically converts boolean values for PostgreSQL compatibility
end)
```

**Supported Boolean Columns:** `enabled`, `active`, `visible`, `online`, `banned`, `locked`, `verified`, `deleted`, `archived`, `public`, `available`, `completed`

### 📈 **Real-Time Performance Monitoring**

Monitor and optimize your database performance with built-in tools:

```bash
# Console commands for monitoring
neondb:status    # View comprehensive status
neondb:health    # Check database health
```

**Performance Metrics Available:**
- Query execution times and slow query detection
- Connection pool utilization
- Cold start recovery events
- Query batching efficiency
- Storage usage analytics

### 🚀 **Query Batching System**

Automatic query batching for optimal performance:

```lua
-- These INSERT operations are automatically batched
for i = 1, 100 do
    exports.neondb:execute('INSERT INTO logs (message, timestamp) VALUES (?, NOW())', 
        {'Batch operation ' .. i})
end
-- Executes as a single transaction for maximum efficiency
```

### �️ **Auto-Recovery Features**

**Cold Start Recovery:**
- Automatically detects and recovers from connection timeouts
- Intelligent connection warmup to prevent performance issues
- Transparent retry logic with exponential backoff

**Primary Key Conflict Resolution:**
- Automatic unique ID generation for INSERT conflicts
- Smart handling of auto-increment ID issues
- Graceful fallback strategies for constraint violations

### 🔍 **Enhanced Error Reporting**

Get detailed, actionable error information:

```lua
exports.neondb:query('SELECT * FROM nonexistent_table', {}, function(result)
    if not result then
        -- Check console for detailed error information including:
        -- - Exact error location in your code
        -- - SQL query that failed
        -- - Suggested fixes and optimizations
        print('Query failed - check console for detailed error report')
    end
end)
```

### 🐛 **Debug Mode Features**

Enable comprehensive development logging:

```bash
set pgsql_debug true
```

**Debug Information Includes:**
- Query execution traces with timing
- Connection pool status changes
- Query conversion details (MySQL → PostgreSQL)
- Performance bottleneck identification
- Storage utilization reports

## 🚨 Error Handling & Recovery

### **Robust Error Management**

NeonDB includes enterprise-grade error handling with automatic recovery:

```lua
-- Automatic retry logic for transient failures
exports.neondb:query('SELECT * FROM users WHERE id = ?', {123}, function(result)
    if not result then
        -- NeonDB automatically:
        -- 1. Retries failed queries with exponential backoff
        -- 2. Attempts connection recovery
        -- 3. Provides detailed error logs
        print('Query failed after all retry attempts')
    end
end)
```

### **Connection Health Monitoring**

- **Automatic Reconnection:** Detects and recovers from dropped connections
- **Health Checks:** Regular connection validation and warmup
- **Pool Management:** Dynamic connection pool optimization
- **Graceful Degradation:** Continues operation during partial failures

## 🔄 MySQL Migration Guide

### **Seamless Migration Process**

NeonDB provides **100% compatibility** with existing oxmysql code:

```lua
-- Your existing oxmysql code works unchanged:
exports.oxmysql:execute('UPDATE users SET active = 1 WHERE id = ?', {playerId})

-- Simply change to neondb:
exports.neondb:execute('UPDATE users SET active = 1 WHERE id = ?', {playerId})
-- Automatically converted to: UPDATE users SET active::integer = 1 WHERE id = $1
```

### **Automatic Query Conversions**

| MySQL Syntax | PostgreSQL Conversion | Notes |
|-------------|----------------------|-------|
| `?` parameters | `$1, $2, $3...` | Automatic parameter mapping |
| `` `table` `` | `"table"` | Backticks → double quotes |
| `TINYINT(1)` | `BOOLEAN` | Data type conversion |
| `DATETIME` | `TIMESTAMP` | Timestamp handling |
| `UNIX_TIMESTAMP()` | `EXTRACT(EPOCH FROM NOW())` | Function translation |
| `LIMIT 10, 20` | `LIMIT 20 OFFSET 10` | Pagination syntax |
| `AUTO_INCREMENT` | `SERIAL` | Auto-increment conversion |
| Boolean `= 1` | `::integer = 1` | Smart boolean casting |

### **Migration Checklist**

✅ **No Code Changes Required** - Drop-in replacement  
✅ **Automatic Schema Translation** - MySQL DDL → PostgreSQL  
✅ **Function Mapping** - All MySQL functions supported  
✅ **Data Type Conversion** - Automatic type mapping  
✅ **Performance Optimization** - PostgreSQL-specific improvements  

## 📊 Performance Optimization Guide

### **Connection Pool Tuning**

```bash
# Optimize for your server load
set pgsql_max_connections 30        # Higher for busy servers
set pgsql_min_connections 8         # Always-ready connections
set pgsql_idle_timeout 45000        # Balance resource usage
```

### **Query Performance Tips**

1. **Use Prepared Statements** for frequently executed queries
2. **Enable Query Batching** for bulk operations
3. **Monitor Slow Queries** and optimize accordingly
4. **Use Connection Warmup** for consistent performance
5. **Leverage PostgreSQL Indexes** for query optimization

### **Memory Management**

```bash
# Optimize memory usage
set pgsql_statement_timeout 45000   # Prevent long-running queries
set pgsql_batch_max_size 15         # Optimal batch size
set pgsql_warmup_frequency 240000   # Regular connection warmup
```

## � Security Features

### **Built-in Security Measures**

- 🔒 **Prepared Statements** - Complete SQL injection protection
- 🔐 **SSL/TLS Support** - Encrypted database connections
- 🛡️ **Parameter Validation** - Automatic input sanitization
- 🔑 **Connection Pooling** - Prevents connection exhaustion attacks
- 📊 **Query Monitoring** - Detects suspicious database activity

### **SSL Configuration**

```bash
# Enable SSL for production
set pgsql_ssl true
set pgsql_connection_string "postgresql://user:pass@host:5432/db?sslmode=require"
```

## 🤝 Contributing & Support

### **Development Setup**

```bash
# Clone the repository
git clone https://github.com/raisen1337/neondb.git
cd neondb

# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build
```

### **Contributing Guidelines**

1. **Fork** the repository
2. **Create** your feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add some amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### **Reporting Issues**

When reporting issues, please include:
- FiveM server version
- PostgreSQL version
- NeonDB configuration
- Complete error logs
- Steps to reproduce

### **Community Support**

- 💬 **Discord:** [Join our community](https://discord.gg/fivem)
<!-- - � **Documentation:** [Full API docs](https://github.com/yourusername/neondb/wiki) -->
- 🐛 **Issues:** [Report bugs](https://github.com/raisen1337/neondb/issues)
- 💡 **Feature Requests:** [Suggest improvements](https://github.com/raisen1337/neondb/discussions)

## �📄 License & Legal

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### **Usage Rights**
- ✅ **Commercial Use** - Use in commercial FiveM servers
- ✅ **Modification** - Modify and customize the code
- ✅ **Distribution** - Redistribute with your modifications
- ✅ **Private Use** - Use for private servers and development

### **Disclaimer**
This software is provided "as is" without warranty of any kind. Use at your own risk.

## 🙏 Acknowledgments & Credits

### **Built For**
- 🎮 **FiveM Community** - The amazing roleplay community
- 🐘 **PostgreSQL** - The world's most advanced open source database
- 🚀 **Performance** - Enterprise-grade database solutions

### **Special Thanks**
- **oxmysql developers** - For inspiration and API compatibility
- **PostgreSQL community** - For the incredible database engine
- **FiveM developers** - For the amazing platform
- **Contributors** - Everyone who helped improve NeonDB

### **Powered By**
- **Node.js** - JavaScript runtime
- **Webpack** - Module bundler for optimized builds
- **PostgreSQL** - Advanced database engine
- **FiveM** - Game modification framework

---

<div align="center">

### 🌟 **Transform Your FiveM Server Today!** 🌟

**Experience enterprise-grade database performance with zero migration effort**

[![Download Now](https://img.shields.io/badge/Download-Latest%20Release-success?style=for-the-badge)](https://github.com/raisen1337/neondb/tree/main)

[![Discord](https://img.shields.io/badge/Join-Discord-blurple?style=for-the-badge)](https://discord.gg/fivem)

*If this project helped you, please consider giving it a ⭐ star on GitHub!*

**Version 1.0.0** | **Production Ready** | **Enterprise Grade**

</div>
