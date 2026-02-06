# App Crash Diagnosis Guide

## Quick Checks

### 1. Check Which App Crashed

**API Server (Backend):**
- Look for errors in the terminal where you ran `npm run dev` in the `api` folder
- Common errors:
  - `Missing required environment variables`
  - `MongoDB connection failed`
  - `SyntaxError` or `ImportError`
  - `Cannot find module`

**Web Server (Frontend):**
- Look for errors in the terminal where you ran `npm run dev` in the `web` folder
- Common errors:
  - `Failed to resolve import`
  - `TypeScript errors`
  - `Port already in use`

### 2. Most Common Crash Causes

#### A. Missing Environment Variables
**Error message:**
```
Missing required environment variables: MONGO_URI, JWT_SECRET
```

**Solution:**
1. Check if `api/.env` file exists
2. Ensure it contains:
   ```env
   PORT=8080
   MONGO_URI=mongodb://localhost:27017/mediscan_ai
   JWT_SECRET=your-secret-key-here
   MODEL_DIR=./models
   ```

#### B. MongoDB Not Running
**Error message:**
```
MongoDB connection failed
```

**Solution:**
1. Start MongoDB service:
   ```powershell
   net start MongoDB
   ```
2. Or check if MongoDB is installed and running

#### C. Import/Syntax Errors
**Error message:**
```
SyntaxError: Unexpected token
Cannot find module '../ml/segmentation/unetSegmenter.js'
```

**Solution:**
1. Check if all new files exist:
   - `api/src/ml/segmentation/unetSegmenter.js`
   - `api/src/ml/explainability/gradcam.js`
   - `api/src/models/Feedback.js`
   - `api/src/models/Annotation.js`

2. Verify imports are correct

#### D. Port Already in Use
**Error message:**
```
Error: listen EADDRINUSE: address already in use :::8080
```

**Solution:**
1. Find and kill the process using port 8080:
   ```powershell
   netstat -ano | findstr :8080
   taskkill /PID <PID> /F
   ```
2. Or change PORT in `.env` file

### 3. Check Server Logs

**For API Server:**
Look for these messages when starting:
```
✅ MongoDB connected (attempt 1)
✅ API listening on http://localhost:8080
```

If you see errors before these, that's the crash point.

**For Web Server:**
Look for:
```
✅ VITE ready in XXX ms
✅ Local: http://localhost:5173/
```

### 4. Quick Fixes

#### Restart Both Servers
1. Stop both servers (Ctrl+C)
2. Restart API:
   ```powershell
   cd api
   npm run dev
   ```
3. Restart Web (new terminal):
   ```powershell
   cd web
   npm run dev
   ```

#### Clear Node Modules (if needed)
```powershell
# In api folder
Remove-Item node_modules -Recurse -Force
npm install

# In web folder
cd ../web
Remove-Item node_modules -Recurse -Force
npm install
```

### 5. Check Specific Files

**If API crashes on startup, check:**
- `api/src/server.js` - Main server file
- `api/src/config/env.js` - Environment config
- `api/src/db/mongo.js` - Database connection

**If Web crashes, check:**
- `web/src/main.tsx` - Entry point
- `web/src/App.tsx` - Main app component
- Browser console (F12) for errors

### 6. Share Error Details

When reporting the crash, please share:
1. **Full error message** from terminal
2. **Which server crashed** (API or Web)
3. **What you were doing** when it crashed
4. **Last few lines** of terminal output

## Example Error Messages

### Good (Server Started):
```
API listening on http://localhost:8080
MongoDB connected (attempt 1)
```

### Bad (Crash):
```
Error: Missing required environment variables: MONGO_URI
Fatal startup error: Error: ...
```

---

**Next Steps:**
1. Check your terminal for the exact error message
2. Match it to the issues above
3. Try the suggested solutions
4. If still stuck, share the exact error message
