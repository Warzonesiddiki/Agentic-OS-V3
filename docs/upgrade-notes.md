# Upgrade Notes

## Overview

This document provides notes for upgrading the Agentic OS V3 application to use PostgreSQL instead of SQLite.

## Upgrade Steps

### Step 1: Install PostgreSQL

1. **Download and Install PostgreSQL**:
   - Download the latest version of PostgreSQL from the official website.
   - Follow the installation instructions for your operating system.

2. **Create a New Database**:
   - Open the PostgreSQL command line tool.
   - Create a new database for the Agentic OS V3 application.
   - Example command: `CREATE DATABASE agentic_os_v3;`

### Step 2: Update Database Configuration

1. **Update Configuration File**:
   - Locate the database configuration file in the Agentic OS V3 application.
   - Update the configuration to use the new PostgreSQL database.
   - Example configuration:
     ```
     DATABASE_URL=postgres://username:password@localhost:5432/agentic_os_v3
     ```

2. **Update Application Code**:
   - Ensure all database operations in the application are updated to use PostgreSQL.
   - Use Drizzle ORM for schema and data migration.

### Step 3: Run Migration Scripts

1. **Schema Migration**:
   - Use Drizzle ORM to migrate the schema from SQLite to PostgreSQL.
   - Example command: `npx drizzle-kit generate:pg --schema=./src/db/schema.ts --out=./migrations`

2. **Data Migration**:
   - Write a script to export data from SQLite and import it into PostgreSQL.
   - Example script:
     ```javascript
     const sqlite = require('sqlite3').verbose();
     const { Pool } = require('pg');

     const sqliteDb = new sqlite.Database('./data/app.sqlite');
     const pgPool = new Pool({
       connectionString: 'postgres://username:password@localhost:5432/agentic_os_v3',
     });

     // Export data from SQLite and import into PostgreSQL
     sqliteDb.all('SELECT * FROM users', (err, rows) => {
       if (err) throw err;
       rows.forEach((row) => {
         pgPool.query(
           'INSERT INTO users (id, name, email) VALUES ($1, $2, $3)',
           [row.id, row.name, row.email],
           (err) => {
             if (err) throw err;
           }
         );
       });
     });
     ```

### Step 4: Testing

1. **Run Tests**:
   - Run comprehensive tests to ensure all functionalities work as expected with PostgreSQL.
   - Example command: `npm test`

2. **Fix Issues**:
   - Fix any issues that arise during testing.

## Conclusion

Following these upgrade notes will ensure a smooth transition from SQLite to PostgreSQL for the Agentic OS V3 application.
