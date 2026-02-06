# Troubleshooting Sign-In Issues

## Common Issues and Solutions

### 1. Check if API Server is Running

```bash
# In api directory
npm run dev
```

You should see:
```
API listening on http://localhost:8080
MongoDB connected (attempt 1)
```

### 2. Check if Web Server is Running

```bash
# In web directory
npm run dev
```

You should see:
```
VITE ready in XXX ms
➜  Local:   http://localhost:5173/
```

### 3. Check API Health Endpoint

Open browser or use curl:
```
http://localhost:8080/healthz
```

Should return: `{"ok":true}`

### 4. Check MongoDB Connection

Ensure MongoDB is running and `MONGO_URI` in `api/.env` is correct:
```env
MONGO_URI=mongodb://localhost:27017/mediscan
```

### 5. Check Browser Console

Open browser DevTools (F12) and check:
- **Console tab**: Look for JavaScript errors
- **Network tab**: Check if `/auth/login` request is being made
  - Status code should be 200 (success) or 401 (invalid credentials)
  - Check the response body for error messages

### 6. Check Server Logs

When you try to sign in, the server should log:
```
Login attempt for email: your@email.com
Login successful for user: your@email.com
```

If you see errors, they will be logged with stack traces.

### 7. Verify User Exists

If you're getting "Invalid credentials", make sure:
- You've registered an account first
- You're using the correct email and password
- The user exists in the database

### 8. Test Registration First

Try registering a new account:
1. Go to `/register`
2. Fill in name, email, password
3. Submit
4. Check server logs for registration success
5. Then try logging in

### 9. Check CORS Configuration

The API allows:
- `http://localhost:5173`
- `http://127.0.0.1:5173`

If your web app is running on a different port, update `api/src/server.js`:
```javascript
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'YOUR_PORT'] }))
```

### 10. Check Environment Variables

Ensure `api/.env` has:
```env
PORT=8080
MONGO_URI=mongodb://localhost:27017/mediscan
JWT_SECRET=your-secret-key-change-in-production
MODEL_DIR=./models
```

### 11. Clear Browser Storage

If you have stale tokens:
1. Open DevTools (F12)
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Clear Local Storage
4. Try logging in again

### 12. Check Network Connectivity

Ensure:
- No firewall blocking localhost:8080
- No proxy interfering
- API and Web servers are on correct ports

## Debug Steps

1. **Check API is accessible:**
   ```bash
   curl http://localhost:8080/healthz
   ```

2. **Test login endpoint directly:**
   ```bash
   curl -X POST http://localhost:8080/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

3. **Check server logs** when attempting login - they now include detailed error messages

4. **Check browser Network tab** to see the actual request/response

## Common Error Messages

- **"Invalid credentials"**: Email or password is incorrect, or user doesn't exist
- **"Server error"**: Check server logs for detailed error (now includes stack trace)
- **"Network error"**: API server might not be running or CORS issue
- **"email and password are required"**: Form fields are empty

## Still Having Issues?

1. Check the server terminal for error logs
2. Check browser console for JavaScript errors
3. Check browser Network tab for failed requests
4. Verify MongoDB is running: `mongosh` or check MongoDB service
5. Try registering a new account to test the flow
