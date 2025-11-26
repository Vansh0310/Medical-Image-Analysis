# MediScan AI - Setup & Run Guide

This guide will help you set up and run the MediScan AI application from scratch.

## Prerequisites

- **Node.js**: Version 18 or 20 (required for TensorFlow.js compatibility)
- **MongoDB**: Running locally or accessible MongoDB instance
- **Git**: To clone the repository

## Quick Start

### 1. API Setup

```bash
# Navigate to API directory
cd api

# Copy environment template
cp .env.example .env

# Edit .env file with your settings
# Required variables:
# PORT=8080
# MONGO_URI=mongodb://localhost:27017/mediscan_ai
# JWT_SECRET=your-secure-jwt-secret-here
# MODEL_DIR=./models/pneumonia_v1
# USE_DEMO_MODEL=false
```

**Required Environment Variables:**
- `MONGO_URI`: MongoDB connection string (default: `mongodb://localhost:27017/mediscan_ai`)
- `JWT_SECRET`: Secret key for JWT tokens (change from default)
- `MODEL_DIR`: Path to AI model directory (default: `./models/pneumonia_v1`)
- `USE_DEMO_MODEL`: Set to `true` for demo mode (uses in-memory model), `false` for real model

### 2. AI Model Setup

#### Option A: Real Model (Recommended)
Create the model directory and place your AI model files:

```bash
# Create model directory
mkdir -p api/models/pneumonia_v1

# Place your model files:
# - api/models/pneumonia_v1/model.json (TensorFlow.js model)
# - api/models/pneumonia_v1/weights_*.bin (model weights)
# - api/models/pneumonia_v1/labels.json (class labels)

# Set USE_DEMO_MODEL=false in .env (default)
```

#### Option B: Demo Mode (For Testing)
If you don't have real model files, you can use the demo mode:

```bash
# Set USE_DEMO_MODEL=true in .env
# The API will create an in-memory model with random weights
# Note: Results are not clinical and are for UI testing only
```

**Example labels.json:**
```json
["Normal", "Pneumonia"]
```

### 3. Install API Dependencies

```bash
cd api
npm install
npm run dev
```

**Verify API is running:**
- Visit: http://localhost:8080/healthz
- Expected response: `{"ok":true}`

**Check Model Status:**
- Visit: http://localhost:8080/ml/status
- Should show `"usingDemoModel": true` for demo mode or `"usingDemoModel": false` for real model

### 4. Web App Setup

```bash
# Navigate to web directory
cd web

# Install dependencies
npm install
npm run dev
```

**Verify Web App is running:**
- Visit: http://localhost:5173
- Should see the MediScan AI homepage

## Complete User Flow

### 1. Registration & Authentication
1. Visit http://localhost:5173
2. Click "Register" → Fill in name, email, password
3. Auto-login after registration
4. Redirected to Upload page

### 2. Medical Image Analysis
1. **Upload**: Select modality (XRAY/SKIN/MRI) + upload image file (JPG/PNG ≤10MB)
2. **Symptoms**: Fill questionnaire (fever, cough, duration, age, history)
3. **Analyze**: Click "Analyze Image" → AI processes image
4. **Results**: View diagnosis, confidence, reasoning

### 3. View Results & History
1. **View Report**: Click "View Detailed Report" → Full analysis details
2. **History**: Click "Go to History" → See all past exams
3. **Navigation**: Access reports from history or upload new images

## API Endpoints

### Health Check
- `GET /healthz` - Server health status

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user (protected)

### Exams (Protected)
- `GET /exams` - List user's exams
- `POST /exams` - Create new exam (multipart: modality + image)
- `GET /exams/:id` - Get exam details
- `POST /exams/:id/questionnaire` - Add symptoms questionnaire
- `POST /exams/:id/predict` - Run AI analysis

### Reports (Protected)
- `GET /reports/:id` - Get analysis report

## Troubleshooting

### Common Issues

**Node.js Version Issues:**
- Use Node.js 18 or 20 only
- TensorFlow.js requires these specific versions
- Check version: `node --version`

**MongoDB Connection:**
- Ensure MongoDB is running locally
- Check connection string in `.env`
- Default: `mongodb://localhost:27017/mediscan_ai`

**CORS Errors:**
- API allows requests from `http://localhost:5173` and `http://127.0.0.1:5173`
- If using different port, update CORS settings in `api/src/server.js`

**Model Loading Issues:**
- Ensure model files are in correct location: `api/models/pneumonia_v1/`
- Required files: `model.json`, `labels.json`, weight files (`*.bin`)
- First prediction will be slower (model warming up)

**File Upload Issues:**
- Max file size: 10MB
- Supported formats: JPG, PNG only
- Check `api/uploads/` directory exists and is writable

**Authentication Issues:**
- Ensure JWT_SECRET is set in `.env`
- Token expires after 7 days
- Clear localStorage if having login issues

### Performance Notes

- **First Prediction**: Takes longer due to model initialization
- **Subsequent Predictions**: Much faster (model cached in memory)
- **File Size**: Larger images take longer to process
- **Database**: MongoDB should be local for best performance

### Development Tips

**API Logs:**
- Check console output for detailed error messages
- Look for MongoDB connection confirmations
- Watch for model loading success/failure

**Web App Logs:**
- Open browser DevTools → Console for client-side errors
- Check Network tab for API request failures
- Verify API base URL in `.env.local`

**Database:**
- Use MongoDB Compass or similar tool to inspect data
- Collections: `users`, `exams`, `reports`
- All exam/report data is user-specific

## File Structure

```
mediscan-ai/
├── api/                    # Express.js backend
│   ├── src/
│   │   ├── server.js      # Main server file
│   │   ├── config/        # Environment config
│   │   ├── db/           # MongoDB connection
│   │   ├── models/       # Database schemas
│   │   ├── routes/       # API endpoints
│   │   ├── auth/         # Authentication logic
│   │   ├── ml/           # AI model integration
│   │   └── rules/        # Clinical rules engine
│   ├── models/           # AI model files (pneumonia_v1/)
│   ├── uploads/          # Uploaded images
│   ├── .env.example      # Environment template
│   └── package.json
├── web/                   # React frontend
│   ├── src/
│   │   ├── pages/        # Route components
│   │   ├── components/   # Reusable components
│   │   ├── contexts/     # React contexts
│   │   └── lib/          # API client
│   ├── .env.local        # Frontend environment
│   └── package.json
└── RUN.md               # This file
```

## Support

If you encounter issues:

1. **Check Node version**: Must be 18 or 20
2. **Verify MongoDB**: Ensure it's running and accessible
3. **Check logs**: Both API and web app console outputs
4. **Model files**: Ensure all required files are present
5. **Environment**: Verify all required variables are set

The application is designed to work out-of-the-box with the provided setup steps. Most issues are related to missing dependencies or incorrect environment configuration.
