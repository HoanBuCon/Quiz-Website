@echo off
REM Windows Batch Script to run MySQL migration
REM Usage: run-migration.bat

echo Running database migration...
echo.

mysql -u fmdowfmw_hoanbucon -p fmdowfmw_quiz_app -e "source migrations/add-document-storage.sql"

echo.
echo Migration completed!
pause
