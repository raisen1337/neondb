# 🚀 NeonDB - PostgreSQL Wrapper for FiveM

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![FiveM](https://img.shields.io/badge/FiveM-Compatible-green.svg)](https://fivem.net/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://postgresql.org/)

> 🔥 A powerful, feature-rich PostgreSQL database wrapper for FiveM servers, designed to seamlessly replace MySQL with advanced auto-conversion capabilities.

## ✨ Features

- 🔄 **MySQL to PostgreSQL Auto-Conversion** - Seamlessly converts MySQL queries to PostgreSQL syntax
- 🚀 **Connection Pooling** - Efficient connection management with configurable pool settings
- 🛠️ **Smart Boolean Handling** - Intelligent conversion between MySQL and PostgreSQL boolean types
- 📊 **Performance Monitoring** - Built-in slow query detection and execution time tracking
- 🔐 **Transaction Support** - Full ACID transaction capabilities
- 🎯 **Auto ID Management** - Handles auto-increment ID issues with intelligent fallbacks
- 🐛 **Debug Mode** - Comprehensive logging for development and troubleshooting
- ⚡ **Prepared Statements** - Support for prepared statements and query caching
- 🔧 **Graceful Error Handling** - Robust error handling with automatic recovery attempts

## 📋 Requirements

- FiveM Server
- PostgreSQL 13+ Database
- Node.js PostgreSQL driver (`pg`)

## 🛠️ Installation

1. **Download and Extract** the resource to your FiveM server's resources folder
2. **Install Dependencies**:
   ```bash
   cd resources/neondb
   npm install pg
   ```
3. **Add to server.cfg**:
   ```
   start neondb
   ```

## ⚙️ Configuration

Configure your database connection using convars in your `server.cfg`:

### Option 1: Connection String (Recommended)
```bash
set pgsql_connection_string "postgresql://username:password@hostname:5432/database"
```

### Option 2: Individual Parameters
```bash
set pgsql_host "localhost"
set pgsql_port 5432
set pgsql_database "fivem"
set pgsql_user "postgres"
set pgsql_password "your_password"
```

### Advanced Configuration
```bash
# Connection Pool Settings
set pgsql_max_connections 20
set pgsql_min_connections 5
set pgsql_idle_timeout 30000
set pgsql_connection_timeout 10000
set pgsql_acquire_timeout 10000

# Performance Settings
set pgsql_slow_query_warning 100
set pgsql_statement_timeout 60000
set pgsql_query_timeout 60000

# SSL Configuration
set pgsql_ssl true

# Debug Mode
set pgsql_debug false
```

## 📖 API Reference

### 🔍 Query Functions

#### `query(sql, parameters, callback)`
Execute a SELECT query and return all rows.

```lua
exports.neondb:query('SELECT * FROM users WHERE age > ?', {25}, function(result)
    for i = 1, #result do
        print('User: ' .. result[i].name)
    end
end)
```

#### `single(sql, parameters, callback)`
Execute a query and return the first row only.

```lua
exports.neondb:single('SELECT * FROM users WHERE id = ?', {123}, function(user)
    if user then
        print('Found user: ' .. user.name)
    end
end)
```

#### `scalar(sql, parameters, callback)`
Execute a query and return a single value.

```lua
exports.neondb:scalar('SELECT COUNT(*) FROM users', {}, function(count)
    print('Total users: ' .. count)
end)
```

### 🔧 Execution Functions

#### `execute(sql, parameters, callback)`
Execute INSERT, UPDATE, or DELETE queries.

```lua
exports.neondb:execute('UPDATE users SET money = ? WHERE id = ?', {5000, 123}, function(result)
    print('Affected rows: ' .. result.affectedRows)
end)
```

#### `insert(sql, parameters, callback)`
Execute INSERT queries with automatic ID return.

```lua
exports.neondb:insert('INSERT INTO users (name, age, money) VALUES (?, ?, ?)', 
    {'John Doe', 25, 1000}, function(insertId)
    print('New user ID: ' .. insertId)
end)
```

#### `update(sql, parameters, callback)`
Execute UPDATE queries.

```lua
exports.neondb:update('UPDATE users SET last_login = NOW() WHERE id = ?', {123}, function(affectedRows)
    print('Updated ' .. affectedRows .. ' rows')
end)
```

### 🔄 Transaction Support

#### `transaction(queries, callback)`
Execute multiple queries in a transaction.

```lua
local queries = {
    {'UPDATE users SET money = money - ? WHERE id = ?', {1000, 1}},
    {'UPDATE users SET money = money + ? WHERE id = ?', {1000, 2}},
    {'INSERT INTO transactions (from_user, to_user, amount) VALUES (?, ?, ?)', {1, 2, 1000}}
}

exports.neondb:transaction(queries, function(results)
    if results then
        print('Transaction completed successfully')
    else
        print('Transaction failed and was rolled back')
    end
end)
```

### 🏪 Prepared Statements

#### `prepare(name, sql, callback)`
Prepare a statement for later execution.

```lua
exports.neondb:prepare('get_user', 'SELECT * FROM users WHERE id = ?', function(success)
    if success then
        print('Statement prepared successfully')
    end
end)
```

#### `store(name, sql, parameters, callback)`
Store a prepared statement with parameters.

```lua
exports.neondb:store('update_money', 'UPDATE users SET money = ? WHERE id = ?', {}, function(success)
    print('Statement stored: ' .. tostring(success))
end)
```

### 🧪 Raw Query Functions

#### `rawQuery(sql, parameters, callback)`
Execute raw PostgreSQL queries without MySQL conversion.

```lua
exports.neondb:rawQuery('SELECT NOW() as current_time', {}, function(result)
    print('Database time: ' .. result[1].current_time)
end)
```

#### `rawExecute(sql, parameters, callback)`
Execute raw PostgreSQL commands without MySQL conversion.

```lua
exports.neondb:rawExecute('CREATE INDEX IF NOT EXISTS idx_users_name ON users(name)', {}, function(result)
    print('Index creation result: ' .. result.affectedRows)
end)
```

### ⚡ Utility Functions

#### `ready(callback)`
Check if the database connection is ready.

```lua
exports.neondb:ready(function(isReady)
    if isReady then
        print('Database is ready!')
        -- Execute your database-dependent code here
    end
end)
```

## 💡 Usage Examples

### 🎮 Player Management System

```lua
-- Create a new player
function CreatePlayer(name, identifier)
    exports.neondb:insert(
        'INSERT INTO users (name, identifier, money, bank, job) VALUES (?, ?, ?, ?, ?)',
        {name, identifier, 5000, 10000, 'unemployed'},
        function(playerId)
            print('Created player with ID: ' .. playerId)
        end
    )
end

-- Get player data
function GetPlayerData(identifier, callback)
    exports.neondb:single(
        'SELECT * FROM users WHERE identifier = ?',
        {identifier},
        callback
    )
end

-- Update player money
function UpdatePlayerMoney(identifier, amount)
    exports.neondb:update(
        'UPDATE users SET money = ? WHERE identifier = ?',
        {amount, identifier},
        function(affectedRows)
            if affectedRows > 0 then
                print('Money updated successfully')
            end
        end
    )
end
```

### 🏠 Property System

```lua
-- Buy property with transaction
function BuyProperty(playerId, propertyId, price)
    local queries = {
        {'UPDATE users SET money = money - ? WHERE id = ? AND money >= ?', {price, playerId, price}},
        {'INSERT INTO owned_properties (player_id, property_id, purchase_date) VALUES (?, ?, NOW())', {playerId, propertyId}},
        {'UPDATE properties SET owned = true WHERE id = ?', {propertyId}}
    }
    
    exports.neondb:transaction(queries, function(results)
        if results then
            print('Property purchased successfully!')
        else
            print('Transaction failed - insufficient funds or other error')
        end
    end)
end
```

### 📦 Inventory System

```lua
-- Add item to inventory
function AddItem(identifier, item, amount, metadata)
    exports.neondb:insert(
        'INSERT INTO inventory_items (inventory_identifier, name, amount, metadata) VALUES (?, ?, ?, ?)',
        {identifier, item, amount, json.encode(metadata or {})},
        function(itemId)
            if itemId then
                print('Item added with ID: ' .. itemId)
            end
        end
    )
end

-- Get player inventory
function GetInventory(identifier, callback)
    exports.neondb:query(
        'SELECT * FROM inventory_items WHERE inventory_identifier = ?',
        {identifier},
        function(items)
            callback(items)
        end
    )
end
```

### 📊 Statistics and Leaderboards

```lua
-- Get top players by money
function GetRichestPlayers(limit, callback)
    exports.neondb:query(
        'SELECT name, money FROM users ORDER BY money DESC LIMIT ?',
        {limit},
        callback
    )
end

-- Get server statistics
function GetServerStats(callback)
    local stats = {}
    
    exports.neondb:scalar('SELECT COUNT(*) FROM users', {}, function(playerCount)
        stats.players = playerCount
        
        exports.neondb:scalar('SELECT AVG(money) FROM users', {}, function(avgMoney)
            stats.averageMoney = avgMoney
            callback(stats)
        end)
    end)
end
```

## 🔧 Advanced Features

### 🎯 Boolean Column Handling

NeonDB automatically handles boolean conversions for common column patterns:

```lua
-- These MySQL-style queries work automatically
exports.neondb:query('SELECT * FROM users WHERE active = 1', {}, function(users)
    -- Returns users where active column is true
end)

exports.neondb:update('UPDATE properties SET for_sale = 0 WHERE id = ?', {123}, function(result)
    -- Sets for_sale to false
end)
```

### 📈 Performance Monitoring

Monitor query performance with built-in tools:

```bash
# In server console
oxpgsql:status
```

### 🐛 Debug Mode

Enable debug mode for detailed logging:

```bash
set pgsql_debug true
```

## 🚨 Error Handling

NeonDB includes robust error handling:

```lua
exports.neondb:query('SELECT * FROM non_existent_table', {}, function(result)
    if not result then
        print('Query failed - check server console for details')
    end
end)
```

## 🔄 MySQL Migration

NeonDB automatically converts most MySQL queries to PostgreSQL:

### Supported Conversions
- ✅ Parameter placeholders (`?` → `$1`, `$2`, etc.)
- ✅ Backticks to double quotes (`` `table` `` → `"table"`)
- ✅ Data types (`TINYINT(1)` → `BOOLEAN`, `DATETIME` → `TIMESTAMP`)
- ✅ Functions (`UNIX_TIMESTAMP()` → `EXTRACT(EPOCH FROM NOW())`)
- ✅ Limit with offset (`LIMIT 10, 20` → `LIMIT 20 OFFSET 10`)
- ✅ Boolean comparisons (`active = 1` → `active::integer = 1`)

### Example Migration
```lua
-- This MySQL query:
exports.neondb:query('SELECT * FROM `users` WHERE `active` = 1 AND `created_at` > UNIX_TIMESTAMP() - 3600 LIMIT 10, 20', {}, callback)

-- Is automatically converted to PostgreSQL:
-- SELECT * FROM "users" WHERE "active"::integer = 1 AND "created_at" > EXTRACT(EPOCH FROM NOW()) - 3600 LIMIT 20 OFFSET 10
```

## 🛡️ Security Features

- 🔒 **Prepared Statements** - Protection against SQL injection
- 🔐 **SSL Support** - Encrypted database connections
- 🛡️ **Parameter Validation** - Automatic parameter sanitization
- 🔑 **Connection Pooling** - Prevents connection exhaustion attacks

## 📊 Performance Tips

1. **Use Connection Pooling**: Configure appropriate pool sizes for your server load
2. **Enable Slow Query Logging**: Monitor and optimize slow queries
3. **Use Transactions**: Batch related operations for better performance
4. **Prepared Statements**: Reuse queries with different parameters
5. **Proper Indexing**: Create indexes on frequently queried columns

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the FiveM community
- Inspired by the need for better PostgreSQL integration
- Thanks to all contributors and testers

---

<div align="center">
  <strong>🌟 If this project helped you, please consider giving it a star! 🌟</strong>
</div>
