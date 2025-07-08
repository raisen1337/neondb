-- fxmanifest.lua
fx_version 'cerulean'
game 'gta5'

name 'neondb'
description 'Complete PostgreSQL wrapper for FiveM with full oxmysql compatibility'
author 'YourName'
version '1.0.0'

server_scripts {
    'dist/server.js'
}

server_exports {
    'execute',
    'query',
    'single',
    'scalar',
    'insert',
    'update',
    'prepare',
    'transaction',
    'ready',
    'rawExecute',
    'rawQuery',
    'store',
    'parseParameters'
}
