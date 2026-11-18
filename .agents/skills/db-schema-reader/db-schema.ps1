<#
.SYNOPSIS
  Read-only database structure viewer (PostgreSQL, MySQL, SQL Server).
  Runs ONLY the fixed metadata queries below. It accepts no SQL from the caller.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .agents\skills\db-schema\scripts\db-schema.ps1 -Profile ALZEVITA -Mode overview
  powershell -NoProfile -ExecutionPolicy Bypass -File .agents\skills\db-schema\scripts\db-schema.ps1 -Profile ALZEVITA -Mode all -Table users

.NOTES
  Connection settings come from environment variables (never from files):
    DB_RO_<PROFILE>_ENGINE   postgres | mysql | sqlserver
    DB_RO_<PROFILE>_HOST
    DB_RO_<PROFILE>_PORT     optional (defaults: 5432, 3306, 1433)
    DB_RO_<PROFILE>_NAME     database name
    DB_RO_<PROFILE>_USER     a READ-ONLY database user
    DB_RO_<PROFILE>_PASSWORD
    DB_RO_<PROFILE>_TRUST_CERT   optional, set to 1 for SQL Server self-signed certificates
  Without -Profile the prefix is DB_RO_ (for example DB_RO_HOST).
  The real guarantee of "no changes" is the read-only database user. This script is a second layer.
  ASCII only on purpose (Windows PowerShell 5.1 safe).
#>
param(
  [string]$Profile = '',
  [ValidateSet('overview', 'tables', 'columns', 'keys', 'indexes', 'views', 'all')]
  [string]$Mode = 'overview',
  [string]$Schema = '',
  [string]$Table = '',
  [int]$MaxLines = 400
)

$ErrorActionPreference = 'Stop'

function Assert-Name {
  param([string]$Value, [string]$Label)
  if ($Value -and ($Value -notmatch '^[A-Za-z0-9_$]+$')) {
    throw ('Invalid ' + $Label + ': only letters, digits, underscore and dollar sign are allowed.')
  }
}

Assert-Name $Profile 'profile'
Assert-Name $Schema 'schema'
Assert-Name $Table 'table'
if ($MaxLines -lt 10 -or $MaxLines -gt 2000) { $MaxLines = 400 }

$prefix = 'DB_RO_'
if ($Profile) { $prefix += $Profile.ToUpper() + '_' }

function Get-Setting {
  param([string]$Name, [bool]$Required = $true)
  $value = [Environment]::GetEnvironmentVariable($prefix + $Name)
  if ($Required -and [string]::IsNullOrEmpty($value)) {
    throw ('Missing setting ' + $prefix + $Name + '. Ask the user to set it. Do not guess values.')
  }
  return $value
}

$engine = (Get-Setting 'ENGINE').ToLower()
if (@('postgres', 'mysql', 'sqlserver') -notcontains $engine) {
  throw ('Unsupported engine "' + $engine + '". Use postgres, mysql or sqlserver.')
}
$dbHost     = Get-Setting 'HOST'
$dbName     = Get-Setting 'NAME'
$dbUser     = Get-Setting 'USER'
$dbPassword = Get-Setting 'PASSWORD'
$dbPort     = Get-Setting 'PORT' $false
if (-not $dbPort) { $dbPort = @{ postgres = '5432'; mysql = '3306'; sqlserver = '1433' }[$engine] }
$trustCert  = Get-Setting 'TRUST_CERT' $false

$clientName = @{ postgres = 'psql'; mysql = 'mysql'; sqlserver = 'sqlcmd' }[$engine]
if (-not (Get-Command $clientName -ErrorAction SilentlyContinue)) {
  throw ($clientName + ' was not found on PATH. Ask the user to install it or add it to PATH.')
}

function New-SchemaFilter {
  param([string]$Column)
  if ($Schema) { return " and $Column = '$Schema'" }
  return ''
}

function New-TableFilter {
  param([string]$Column)
  if ($Table) { return " and $Column = '$Table'" }
  return ''
}

# ------------------------------------------------------------------ queries
function Get-Queries {
  if ($engine -eq 'postgres') {
    $sysSchemas = "('pg_catalog','information_schema','pg_toast')"
    $base = "n.nspname not in $sysSchemas and n.nspname not like 'pg_temp%'"
    $sc = New-SchemaFilter 'n.nspname'
    $tb = New-TableFilter 'c.relname'
    $scIdx = New-SchemaFilter 'schemaname'
    $tbIdx = New-TableFilter 'tablename'
    return [ordered]@{
      overview = @("select n.nspname as schema_name, count(*) as tables from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','p') and $base $sc group by n.nspname order by 1")
      tables   = @("select n.nspname as schema_name, c.relname as table_name, c.reltuples::bigint as approx_rows from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','p') and $base $sc $tb order by 1, 2")
      columns  = @("select n.nspname as schema_name, c.relname as table_name, a.attnum as pos, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as data_type, case when a.attnotnull then 'NO' else 'YES' end as nullable, pg_get_expr(d.adbin, d.adrelid) as column_default from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attnum > 0 and not a.attisdropped and c.relkind in ('r','p') and $base $sc $tb order by 1, 2, 3")
      keys     = @("select n.nspname as schema_name, c.relname as table_name, case k.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY' when 'u' then 'UNIQUE' when 'c' then 'CHECK' end as type, k.conname as name, pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where k.contype in ('p','f','u','c') and $base $sc $tb order by 1, 2, 3, 4")
      indexes  = @("select schemaname as schema_name, tablename as table_name, indexname as index_name, indexdef as definition from pg_indexes where schemaname not in $sysSchemas $scIdx $tbIdx order by 1, 2, 3")
      views    = @("select n.nspname as schema_name, c.relname as view_name, case c.relkind when 'v' then 'view' else 'materialized view' end as kind from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('v','m') and $base $sc $tb order by 1, 2")
    }
  }

  if ($engine -eq 'mysql') {
    $scope = 'database()'
    if ($Schema) { $scope = "'" + $Schema + "'" }
    $tb   = New-TableFilter 'table_name'
    $tbTc = New-TableFilter 'tc.table_name'
    return [ordered]@{
      overview = @("select table_schema as schema_name, count(*) as tables from information_schema.tables where table_type = 'BASE TABLE' and table_schema = $scope group by table_schema")
      tables   = @("select table_schema as schema_name, table_name, table_rows as approx_rows, engine from information_schema.tables where table_type = 'BASE TABLE' and table_schema = $scope $tb order by 1, 2")
      columns  = @("select table_schema as schema_name, table_name, ordinal_position as pos, column_name, column_type, is_nullable, column_key, column_default, extra from information_schema.columns where table_schema = $scope $tb order by 1, 2, 3")
      keys     = @("select tc.table_schema as schema_name, tc.table_name, tc.constraint_type, tc.constraint_name, group_concat(kcu.column_name order by kcu.ordinal_position separator ', ') as columns_list, max(kcu.referenced_table_name) as ref_table, group_concat(kcu.referenced_column_name order by kcu.ordinal_position separator ', ') as ref_columns from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema and kcu.table_name = tc.table_name where tc.table_schema = $scope and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY','UNIQUE') $tbTc group by tc.table_schema, tc.table_name, tc.constraint_type, tc.constraint_name order by 1, 2, 3, 4")
      indexes  = @("select table_schema as schema_name, table_name, index_name, non_unique, group_concat(column_name order by seq_in_index separator ', ') as columns_list, index_type from information_schema.statistics where table_schema = $scope $tb group by table_schema, table_name, index_name, non_unique, index_type order by 1, 2, 3")
      views    = @("select table_schema as schema_name, table_name as view_name from information_schema.views where table_schema = $scope $tb order by 1, 2")
    }
  }

  # sqlserver
  $sc  = New-SchemaFilter 'table_schema'
  $tb  = New-TableFilter 'table_name'
  $scT = New-SchemaFilter 's.name'
  $tbT = New-TableFilter 't.name'
  $scTc = New-SchemaFilter 'tc.table_schema'
  $tbTc = New-TableFilter 'tc.table_name'
  return [ordered]@{
    overview = @("select table_schema as schema_name, count(*) as tables from information_schema.tables where table_type = 'BASE TABLE' $sc group by table_schema order by 1")
    tables   = @("select table_schema as schema_name, table_name from information_schema.tables where table_type = 'BASE TABLE' $sc $tb order by 1, 2")
    columns  = @("select table_schema as schema_name, table_name, ordinal_position as pos, column_name, data_type, character_maximum_length as max_len, is_nullable, column_default from information_schema.columns where 1 = 1 $sc $tb order by 1, 2, 3")
    keys     = @(
      "select tc.table_schema as schema_name, tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position as pos, kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name where tc.constraint_type in ('PRIMARY KEY','UNIQUE') $scTc $tbTc order by 1, 2, 4, 5",
      "select ps.name as schema_name, pt.name as table_name, 'FOREIGN KEY' as constraint_type, fk.name as constraint_name, pc.name as column_name, rs.name + '.' + rt.name as ref_table, rc.name as ref_column from sys.foreign_keys fk join sys.foreign_key_columns fkc on fkc.constraint_object_id = fk.object_id join sys.tables pt on pt.object_id = fk.parent_object_id join sys.schemas ps on ps.schema_id = pt.schema_id join sys.columns pc on pc.object_id = fkc.parent_object_id and pc.column_id = fkc.parent_column_id join sys.tables rt on rt.object_id = fk.referenced_object_id join sys.schemas rs on rs.schema_id = rt.schema_id join sys.columns rc on rc.object_id = fkc.referenced_object_id and rc.column_id = fkc.referenced_column_id where 1 = 1 " + (New-SchemaFilter 'ps.name') + (New-TableFilter 'pt.name') + " order by 1, 2, 4, fkc.constraint_column_id"
    )
    indexes  = @("select s.name as schema_name, t.name as table_name, i.name as index_name, i.type_desc as index_type, i.is_unique, i.is_primary_key, ic.key_ordinal, c.name as column_name, ic.is_included_column from sys.indexes i join sys.tables t on t.object_id = i.object_id join sys.schemas s on s.schema_id = t.schema_id join sys.index_columns ic on ic.object_id = i.object_id and ic.index_id = i.index_id join sys.columns c on c.object_id = ic.object_id and c.column_id = ic.column_id where i.name is not null $scT $tbT order by s.name, t.name, i.name, ic.key_ordinal")
    views    = @("select table_schema as schema_name, table_name as view_name from information_schema.views where 1 = 1 $sc $tb order by 1, 2")
  }
}

# ------------------------------------------------------------------- runner
function Invoke-ReadOnlySql {
  param([string]$Sql)
  $oneLine = ($Sql -replace '\s+', ' ').Trim()
  # Belt and braces: fixed queries only, a single SELECT statement.
  if ($oneLine -notmatch '^select\s') { throw 'Only SELECT statements are allowed.' }
  if ($oneLine.Contains(';')) { throw 'Multiple statements are not allowed.' }

  try {
    switch ($engine) {
      'postgres' {
        $env:PGPASSWORD = $dbPassword
        $env:PGOPTIONS  = '-c default_transaction_read_only=on'
        $result = & psql -X -q -v ON_ERROR_STOP=1 -h $dbHost -p $dbPort -U $dbUser -d $dbName -P pager=off -c $oneLine
      }
      'mysql' {
        $env:MYSQL_PWD = $dbPassword
        $result = & mysql -h $dbHost -P $dbPort -u $dbUser -D $dbName --table '--init-command=SET SESSION TRANSACTION READ ONLY' -e $oneLine
      }
      'sqlserver' {
        $env:SQLCMDPASSWORD = $dbPassword
        $sqlArgs = @('-S', ($dbHost + ',' + $dbPort), '-d', $dbName, '-U', $dbUser, '-W', '-s', '|', '-b', '-Q', $oneLine)
        if ($trustCert -eq '1') { $sqlArgs += '-C' }
        $result = & sqlcmd @sqlArgs
      }
    }
    if ($LASTEXITCODE -ne 0) { throw ($clientName + ' exited with code ' + $LASTEXITCODE) }
    return $result
  }
  finally {
    $env:PGPASSWORD = $null
    $env:PGOPTIONS = $null
    $env:MYSQL_PWD = $null
    $env:SQLCMDPASSWORD = $null
  }
}

$queries = Get-Queries
$modes = @($Mode)
if ($Mode -eq 'all') { $modes = @('overview', 'tables', 'columns', 'keys', 'indexes', 'views') }

foreach ($m in $modes) {
  Write-Output ('== ' + $m + ' (' + $engine + ', database ' + $dbName + ') ==')
  foreach ($sql in $queries[$m]) {
    $lines = @(Invoke-ReadOnlySql $sql)
    $lines | Select-Object -First $MaxLines
    if ($lines.Count -gt $MaxLines) {
      Write-Output ('... output cut at ' + $MaxLines + ' lines. Narrow it with -Schema or -Table.')
    }
  }
  Write-Output ''
}
