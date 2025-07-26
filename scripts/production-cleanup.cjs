#!/usr/bin/env node
// @ts-check

const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning up for production release...');

// Files and directories to remove for production
const productionCleanupPaths = [
  // Build outputs
  'dist',
  'release',
  
  // Development and test files
  'electron/test-ipc.cjs',
  'electron/test-ipc.js', 
  'electron/test-preload.cjs',
  'electron/test-preload.js',
  'electron/test.html',
  
  // Development scripts
  'run-electron.js',
  'install.js',
  
  // Config files not needed in production
  'eslint.config.js',
  'tsconfig.app.json',
  'tsconfig.json', 
  'tsconfig.node.json',
  
  // Cache and temp directories
  '.vite',
  'node_modules/.cache',
  
  // Server temp files
  'server/uploads',
  'server/outputs'
];

// Function to remove files/directories
function cleanup(targetPath) {
  const fullPath = path.resolve(targetPath);
  
  try {
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`✅ Removed directory: ${targetPath}`);
      } else {
        fs.unlinkSync(fullPath);
        console.log(`✅ Removed file: ${targetPath}`);
      }
    } else {
      console.log(`⚠️  Path does not exist: ${targetPath}`);
    }
  } catch (error) {
    console.log(`❌ Could not remove ${targetPath}: ${error.message}`);
  }
}

// Function to recursively find and remove test files
function removeTestFiles(dir) {
  try {
    if (!fs.existsSync(dir) || dir.includes('node_modules')) return;
    
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        removeTestFiles(filePath);
      } else if (
        file.includes('.test.') || 
        file.includes('.spec.') ||
        file.includes('test-') ||
        file.startsWith('test.')
      ) {
        try {
          fs.unlinkSync(filePath);
          console.log(`✅ Removed test file: ${filePath}`);
        } catch (error) {
          console.log(`❌ Could not remove test file ${filePath}: ${error.message}`);
        }
      }
    });
  } catch (error) {
    console.log(`⚠️  Error accessing directory ${dir}: ${error.message}`);
  }
}

// Function to recreate empty directories with .gitkeep
function recreateEmptyDirs() {
  const emptyDirs = [
    'server/uploads',
    'server/outputs'
  ];
  
  emptyDirs.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, '.gitkeep'), '');
        console.log(`✅ Recreated empty directory: ${dir}`);
      }
    } catch (error) {
      console.log(`❌ Could not recreate directory ${dir}: ${error.message}`);
    }
  });
}

// Clean up main paths
console.log('\n📁 Cleaning up main directories and files...');
productionCleanupPaths.forEach(cleanup);

// Remove test files from all directories
console.log('\n🧪 Removing test files...');
removeTestFiles('.');
removeTestFiles('src');
removeTestFiles('electron');
removeTestFiles('server');

// Recreate necessary empty directories
console.log('\n📂 Recreating necessary empty directories...');
recreateEmptyDirs();

// Clean up package.json scripts for production
console.log('\n📦 Cleaning up package.json for production...');
try {
  const packagePath = path.resolve('package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Remove development-only scripts
  const devScripts = ['electron:dev', 'electron:dev:single', 'setup'];
  devScripts.forEach(script => {
    if (packageJson.scripts[script]) {
      delete packageJson.scripts[script];
      console.log(`✅ Removed dev script: ${script}`);
    }
  });
  
  // Update scripts for production
  packageJson.scripts.start = 'npm run electron:build';
  
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Updated package.json for production');
} catch (error) {
  console.log(`❌ Could not update package.json: ${error.message}`);
}

console.log('\n🎉 Production cleanup completed!');
console.log('\n📋 Summary:');
console.log('- Removed all test files and directories');
console.log('- Removed development configuration files');
console.log('- Cleaned up server upload/output directories');
console.log('- Updated package.json for production');
console.log('- Ready for publication!');

console.log('\n🚀 Next steps:');
console.log('1. Run: npm run build:prod');
console.log('2. Run: npm run electron:build');
console.log('3. Your app is ready for distribution!');
