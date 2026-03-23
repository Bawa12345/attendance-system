# Attendance System

Building an attendance system with Android and Web Dashboard.

## 🚀 Running the Demo (Ngrok)

The mobile application is configured to connect to the backend through an **ngrok** tunnel. This allows you to test the mobile app on a remote device without deploying the backend to a permanent server. 

### **Ngrok URL Reference:**
> `https://unmortgageable-armless-willia.ngrok-free.dev`

### **Connecting the Mobile App:**
This URL is already set as the fallback default API URL within the mobile app. You can verify this in `mobile-app/src/App.jsx`:
```javascript
export const API_URL = import.meta.env.VITE_API_URL || 'https://unmortgageable-armless-willia.ngrok-free.dev';
```

### **Starting the Demo Backend**
If the backend is not yet running attached to ngrok, follow these steps:
1. Start the Node.js backend (`cd backend && npm start`).
2. Expose the port with Ngrok: `ngrok http --domain=unmortgageable-armless-willia.ngrok-free.dev 3000` (Requires your ngrok token config).

---
## Setup Instructions

1. **Backend**:
    ```bash
    cd backend
    npm start
    ```
    This will start the Express API on port 3000 and create the database automatically with an 'admin' user (password: 'admin123').

2. **Web Dashboard**:
    ```bash
    cd web-dashboard
    npm run dev
    ```
    This will start the React web dashboard. Login with the 'admin' credentials.

3. **Android Mobile App**:
    ```bash
    cd mobile-app
    npm run dev
    # Or to sync natively:
    # npm run build
    # npx cap sync android
    # npx cap open android
    ```
    Login with employee credentials created from the Web Dashboard.

## Requirements
- Node.js
- Android Studio (for native mobile building)
