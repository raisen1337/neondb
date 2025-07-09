--- @meta

--- @class neondb
local neondb = {}

--- @class ExecuteResult
--- @field affectedRows integer
--- @field insertId any
--- @field warningCount integer
--- @field changedRows integer
--- @field fieldCount integer
--- @field serverStatus integer
--- @field info string
--- @field executionTime integer

--- @class CallerInfo
--- @field resource string
--- @field file string
--- @field line string|integer
--- @field location string

--- @class TableInfo
--- @field columns table<string, ColumnInfo>
--- @field primaryKey string|nil
--- @field hasIdentityColumn boolean

--- @class ColumnInfo
--- @field dataType string
--- @field notNull boolean
--- @field isPrimaryKey boolean
--- @field defaultValue string|nil

--- @class WhereCondition
--- @field [string] any

--- Execute a SQL query that modifies data (INSERT, UPDATE, DELETE)
--- @param query string The SQL query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(result: ExecuteResult|false, error?: string) Optional callback function
--- @return Promise<ExecuteResult>
function neondb.execute(query, parameters, callback) end

--- Execute a SQL query that returns data (SELECT)
--- @param query string The SQL query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(rows: table[]) Optional callback function
--- @return Promise<table[]>
function neondb.query(query, parameters, callback) end

--- Execute a SQL query and return only the first row
--- @param query string The SQL query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(row: table|nil) Optional callback function
--- @return Promise<table|nil>
function neondb.single(query, parameters, callback) end

--- Execute a SQL query and return only the first column of the first row
--- @param query string The SQL query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(value: any) Optional callback function
--- @return Promise<any>
function neondb.scalar(query, parameters, callback) end

--- Execute an INSERT query and return the inserted ID
--- @param query string The INSERT query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(insertId: any|false) Optional callback function
--- @return Promise<any>
function neondb.insert(query, parameters, callback) end

--- Execute an UPDATE query and return the number of affected rows
--- @param query string The UPDATE query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(affectedRows: integer|false) Optional callback function
--- @return Promise<integer>
function neondb.update(query, parameters, callback) end

--- Prepare a SQL statement for later execution
--- @param name string Name for the prepared statement
--- @param query string The SQL query to prepare
--- @param callback? fun(success: boolean) Optional callback function
--- @return Promise<boolean>
function neondb.prepare(name, query, callback) end

--- Execute multiple queries in a transaction
--- @param queries (string|string[]|{query: string, parameters?: any[]})[] Array of queries to execute
--- @param callback? fun(results: ExecuteResult[]|false, error?: string) Optional callback function
--- @return Promise<ExecuteResult[]>
function neondb.transaction(queries, callback) end

--- Check if the database is ready
--- @param callback? fun(ready: boolean) Optional callback function
--- @return boolean
function neondb.ready(callback) end

--- Raw execute function (alias for execute)
--- @param query string The SQL query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(result: ExecuteResult|false, error?: string) Optional callback function
--- @return Promise<ExecuteResult>
function neondb.rawExecute(query, parameters, callback) end

--- Raw query function (alias for query)
--- @param query string The SQL query to execute
--- @param parameters? any[] Parameters for the query
--- @param callback? fun(rows: table[]) Optional callback function
--- @return Promise<table[]>
function neondb.rawQuery(query, parameters, callback) end

--- Store a prepared statement (alias for prepare)
--- @param name string Name for the prepared statement
--- @param query string The SQL query to prepare
--- @param callback? fun(success: boolean) Optional callback function
--- @return Promise<boolean>
function neondb.store(name, query, callback) end

--- SQL Builder: SELECT query
--- @param table string Table name
--- @param columns? string|string[] Columns to select (default: '*')
--- @param where? string|WhereCondition WHERE conditions
--- @param orderBy? string ORDER BY clause
--- @param limit? integer LIMIT clause
--- @return Promise<table[]>
function neondb.select(table, columns, where, orderBy, limit) end

--- SQL Builder: INSERT query
--- @param table string Table name
--- @param data table<string, any> Data to insert
--- @return Promise<ExecuteResult>
function neondb.insertInto(table, data) end

--- SQL Builder: UPDATE query
--- @param table string Table name
--- @param data table<string, any> Data to update
--- @param where string|WhereCondition WHERE conditions
--- @return Promise<ExecuteResult>
function neondb.updateTable(table, data, where) end

--- SQL Builder: DELETE query
--- @param table string Table name
--- @param where string|WhereCondition WHERE conditions
--- @return Promise<ExecuteResult>
function neondb.deleteFrom(table, where) end

--- SQL Builder: CREATE TABLE query
--- @param tableName string Table name
--- @param columns table<string, string> Column definitions
--- @param options? {ifNotExists?: boolean} Options
--- @return Promise<ExecuteResult>
function neondb.createTable(tableName, columns, options) end

--- SQL Builder: DROP TABLE query
--- @param tableName string Table name
--- @param ifExists? boolean Add IF EXISTS clause (default: true)
--- @return Promise<ExecuteResult>
function neondb.dropTable(tableName, ifExists) end

--- Parse parameters into array format
--- @param parameters any Parameters to parse
--- @return any[]
function neondb.parseParameters(parameters) end

--- @class Promise<T>
--- @field then fun(self: Promise, onFulfilled?: fun(value: T), onRejected?: fun(reason: any)): Promise
--- @field catch fun(self: Promise, onRejected?: fun(reason: any)): Promise
local Promise = {}

--- @class exports
--- @field neondb neondb
exports = {}

return neondb
