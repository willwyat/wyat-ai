#!/bin/bash

# Journal Data Backup Script
# Creates a backup of journal entries before migration

echo "💾 Creating Journal Data Backup..."
echo "================================="

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="journal_backup_${TIMESTAMP}.json"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "📁 Backup directory: $BACKUP_DIR"
echo "📄 Backup file: $BACKUP_FILE"

# Check if mongodump is available
if command -v mongodump &> /dev/null; then
    echo "🔧 Using mongodump for backup..."
    
    # Create backup using mongodump
    mongodump --db wyat --collection journal_entries --out "$BACKUP_DIR/mongodump_${TIMESTAMP}"
    
    echo "✅ Binary backup created: $BACKUP_DIR/mongodump_${TIMESTAMP}/"
    
elif command -v mongoexport &> /dev/null; then
    echo "🔧 Using mongoexport for backup..."
    
    # Create JSON backup using mongoexport
    mongoexport --db wyat --collection journal_entries --out "$BACKUP_DIR/$BACKUP_FILE"
    
    echo "✅ JSON backup created: $BACKUP_DIR/$BACKUP_FILE"
    
else
    echo "❌ Neither mongodump nor mongoexport found!"
    echo "Please install MongoDB tools to create a backup."
    echo ""
    echo "Installation:"
    echo "- macOS: brew install mongodb/brew/mongodb-database-tools"
    echo "- Ubuntu: apt-get install mongodb-database-tools"
    echo "- Or download from: https://www.mongodb.com/try/download/database-tools"
    exit 1
fi

echo ""
echo "🎯 Backup Summary:"
echo "- Database: wyat"
echo "- Collection: journal_entries"
echo "- Backup location: $BACKUP_DIR"
echo ""
echo "⚠️  Important:"
echo "- Keep this backup safe until migration is complete"
echo "- Test the migration on a copy of your data first"
echo "- You can restore from this backup if needed"
