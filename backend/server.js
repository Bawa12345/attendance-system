const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const multer = require('multer');
const path = require('path');
require('dotenv').config();


const app = express();
app.use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }));
  
app.use(express.json({ limit: '50mb' }));
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';

// Haversine formula
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  var R = 6371e3;
  var dLat = deg2rad(lat2-lat1);  
  var dLon = deg2rad(lon2-lon1); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}
function deg2rad(deg) { return deg * (Math.PI/180); }

const admin = require('firebase-admin');

// Multer in-memory storage for Firebase Functions
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware for auth
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.sendStatus(401);
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
        return res.status(403).json({ error: "Access denied" });
    }
    next();
};

const isSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
    }
    next();
};

const getAllowedUserIds = async (req) => {
    if (req.user.role === 'admin') return null; // null means all users
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    const allowed = new Set();
    const myId = String(req.user.id);
    let myTollPlaza = null;
    snapshot.forEach(doc => {
        if (doc.id === myId) myTollPlaza = doc.data().toll_plaza_id;
    });
    snapshot.forEach(doc => {
        const d = doc.data();
        if (d.manager_id === myId || (myTollPlaza && d.toll_plaza_id === myTollPlaza) || doc.id === myId) {
            allowed.add(doc.id);
        }
    });
    return allowed;
};

// ----------------------------------------------------
// Authentication
// ----------------------------------------------------
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('username', '==', username).get();
        
        if (snapshot.empty) return res.status(401).json({ error: "Invalid credentials or inactive user" });
        
        let user = null;
        let userId = null;
        snapshot.forEach(doc => { user = doc.data(); userId = doc.id; });
        user.id = userId;
        
        if (user.active === 0) return res.status(401).json({ error: "Invalid credentials or inactive user" });
        
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ error: "Invalid credentials" });
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: 86400 });
        res.json({ auth: true, token, user: { id: user.id, username: user.username, role: user.role } });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/devlogin', async (req, res) => {
    try {
        const snapshot = await db.collection('users').where('role', '==', 'employee').limit(1).get();
        if (snapshot.empty) {
            const token = jwt.sign({ id: '999', username: 'dev_user', role: 'employee' }, JWT_SECRET, { expiresIn: '8h' });
            res.json({ auth: true, token, user: { id: '999', username: 'dev_user', role: 'employee' }});
        } else {
            let user = null;
            let userId = null;
            snapshot.forEach(doc => { user = doc.data(); userId = doc.id; });
            user.id = userId;
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
            res.json({ auth: true, token, user });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Employee Management (Admin/Manager)
// ----------------------------------------------------
app.post('/api/admin/employees', authenticateToken, isAdmin, upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'cert_qual', maxCount: 1 },
    { name: 'cert_exp', maxCount: 1 },
    { name: 'cert_other', maxCount: 1 }
]), async (req, res) => {
    try {
        const { username, password, role, personal_details, salary_structure, toll_plaza_id, manager_id } = req.body;
        const userRole = role || 'employee';
        const hashedPassword = bcrypt.hashSync(password, 8);
        
        let documents = {};
        if (req.files) {
            const bucket = admin.storage().bucket();
            const keys = ['resume', 'cert_qual', 'cert_exp', 'cert_other'];
            for (const key of keys) {
                if (req.files[key] && req.files[key][0]) {
                    const fileObj = req.files[key][0];
                    const fileName = `uploads/${Date.now()}-${fileObj.originalname}`;
                    const fileUpload = bucket.file(fileName);
                    await fileUpload.save(fileObj.buffer, { contentType: fileObj.mimetype });
                    await fileUpload.makePublic();
                    documents[key] = fileUpload.publicUrl();
                }
            }
        }
        const docsJson = JSON.stringify(documents);
        
        const result = await db.collection('users').add({
            username, 
            password: hashedPassword, 
            role: userRole, 
            active: 1,
            personal_details: personal_details || null, 
            salary_structure: salary_structure || null, 
            documents: docsJson, 
            toll_plaza_id: toll_plaza_id || null, 
            manager_id: manager_id || null,
            can_view_slip: 1
        });
        
        res.status(201).json({ id: result.id, username, role: userRole });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/employees', authenticateToken, isAdmin, async (req, res) => {
    try {
        let snapshot;
        const usersRef = db.collection('users');
        
        if (req.user.role === 'manager') {
            const managerId = String(req.user.id);
            // In a NoSQL db like Firestore, OR queries between fields require multiple queries or specific setups.
            // For simplicity, we fetch all users and filter locally.
            snapshot = await usersRef.get();
        } else {
            snapshot = await usersRef.get();
        }

        const allowedTollPlazas = new Set();
        const users = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            // Remove password for security
            delete data.password;
            users.push(data);
            
            if (doc.id === req.user.id && data.toll_plaza_id) {
                allowedTollPlazas.add(data.toll_plaza_id);
            }
        });
        
        let filteredUsers = users;
        if (req.user.role === 'manager') {
            filteredUsers = users.filter(u => u.manager_id === req.user.id || allowedTollPlazas.has(u.toll_plaza_id));
        }
        
        res.json({ data: filteredUsers });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/employees/:id/deactivate', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('users').doc(id).update({ active: 0 });
        res.json({ message: "Employee deactivated" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Toll Plazas Management
// ----------------------------------------------------
app.get('/api/admin/toll_plazas', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db.collection('toll_plazas').get();
        const plazas = [];
        snapshot.forEach(doc => { plazas.push({ id: doc.id, ...doc.data() }); });
        res.json({ data: plazas });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/toll_plazas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { name, latitude, longitude, radius, location_address } = req.body;
        const result = await db.collection('toll_plazas').add({
            name, latitude, longitude, radius: parseInt(radius) || 500, location_address
        });
        res.status(201).json({ id: result.id, message: "Toll plaza created" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Attendance Management
// ----------------------------------------------------
app.get('/api/admin/attendance', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('attendance').orderBy('check_in', 'desc').get();
        const docs = [];
        
        const usersSnapshot = await db.collection('users').get();
        const userMap = {};
        usersSnapshot.forEach(u => { userMap[u.id] = u.data().username; });
        const allowed = await getAllowedUserIds(req);

        snapshot.forEach(doc => { 
            const data = doc.data();
            if (allowed && !allowed.has(data.user_id)) return;
            data.id = doc.id;
            data.username = userMap[data.user_id] || 'Unknown';
            docs.push(data); 
        });
        
        res.json({ data: docs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/notifications', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('notifications').orderBy('created_at', 'desc').get();
        let docs = [];
        const allowed = await getAllowedUserIds(req);
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (allowed && !allowed.has(data.user_id)) return;
            docs.push({ id: doc.id, ...data });
        });
        res.json({ data: docs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const snapshot = await db.collection('notifications').where('user_id', '==', userId).get();
        let docs = [];
        snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        docs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ data: docs });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: upload a base64 photo to Firebase Storage and return its public URL
async function uploadPhotoToStorage(base64DataUrl, folder) {
    if (!base64DataUrl) return null;
    try {
        const bucket = admin.storage().bucket();
        const matches = base64DataUrl.match(/^data:(.+);base64,(.+)$/);
        let mimeType = 'image/jpeg';
        let base64Data = base64DataUrl;
        if (matches) {
            mimeType = matches[1];
            base64Data = matches[2];
        }
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
        const file = bucket.file(fileName);
        await file.save(buffer, { contentType: mimeType, resumable: false });
        await file.makePublic();
        return file.publicUrl();
    } catch (e) {
        console.error('Photo upload failed:', e.message);
        return null; // Non-fatal: allow check-in/out to succeed even if photo upload fails
    }
}

app.post('/api/attendance/checkin', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const timestamp = new Date().toISOString();
        const { latitude, longitude, photo_in, device_id } = req.body;
        const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown IP';
        
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        let in_geofence = 1;

        if (userData && userData.toll_plaza_id && latitude && longitude) {
            const tollDoc = await db.collection('toll_plazas').doc(String(userData.toll_plaza_id)).get();
            if (tollDoc.exists) {
                const tollData = tollDoc.data();
                if (tollData.latitude && tollData.longitude) {
                    const dist = getDistanceFromLatLonInM(parseFloat(latitude), parseFloat(longitude), parseFloat(tollData.latitude), parseFloat(tollData.longitude));
                    const maxRadius = tollData.radius || 500;
                    if (dist > maxRadius) {
                        return res.status(403).json({ error: `Punch blocked: You are ${Math.round(dist)}m away. Must be within ${maxRadius}m of your assigned Toll Plaza.` });
                    }
                }
            }
        }
        
        let shiftTime = 'Flexible';
        const hour = new Date().getHours();
        let isLate = false;
        
        if (hour >= 6 && hour < 14) {
             shiftTime = 'Morning';
             if (hour >= 10) isLate = true; // Late past 10 AM
        }
        else if (hour >= 14 && hour < 22) shiftTime = 'Evening';
        else if (hour >= 22 || hour < 6) shiftTime = 'Night';

        // Upload selfie to Firebase Storage (avoids Firestore 1MB document limit)
        const photo_in_url = await uploadPhotoToStorage(photo_in, `attendance/checkin/${userId}`);

        const result = await db.collection('attendance').add({
            user_id: userId,
            check_in: timestamp,
            check_out: null,
            latitude,
            longitude,
            ip_address,
            device_id: device_id || 'Browser/Unknown',
            photo_in: photo_in_url,
            in_geofence,
            shift_timing: shiftTime,
            status: isLate ? 'Late Entry' : 'Present'
        });

        if (isLate) {
            await db.collection('notifications').add({
                 user_id: userId,
                 type: 'Late Punch',
                 message: `Late check-in recorded at ${new Date(timestamp).toLocaleTimeString()}`,
                 created_at: timestamp,
                 username: req.user.username || 'Employee'
            });
        }
        
        res.status(201).json({ id: result.id, timestamp, message: "Checked in successfully" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance/checkout', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const timestamp = new Date().toISOString();
        const { latitude, longitude, photo_out, device_id } = req.body;
        
        // Find latest active check-in
        const snapshot = await db.collection('attendance')
            .where('user_id', '==', userId)
            .get();
        let targetDocs = [];
        snapshot.forEach(doc => { if(doc.data().check_out === null) targetDocs.push(doc); });
            
        if (targetDocs.length === 0) return res.status(400).json({ error: "No active check-in found" });
        targetDocs.sort((a, b) => new Date(b.data().check_in) - new Date(a.data().check_in));
        
        const docRef = targetDocs[0];
        const row = docRef.data();
        const attendanceId = docRef.id;

        // Perform geolocation lookup
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (userData && userData.toll_plaza_id && latitude && longitude) {
            const tollDoc = await db.collection('toll_plazas').doc(String(userData.toll_plaza_id)).get();
            if (tollDoc.exists) {
                const tollData = tollDoc.data();
                if (tollData.latitude && tollData.longitude) {
                    const dist = getDistanceFromLatLonInM(parseFloat(latitude), parseFloat(longitude), parseFloat(tollData.latitude), parseFloat(tollData.longitude));
                    const maxRadius = tollData.radius || 500;
                    if (dist > maxRadius) {
                        return res.status(403).json({ error: `Punch out blocked: You are ${Math.round(dist)}m away. Must be within ${maxRadius}m of your assigned Toll Plaza.` });
                    }
                }
            }
        }
        
        const checkInTime = new Date(row.check_in);
        const checkOutTime = new Date(timestamp);
        const totalHoursGross = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
        const totalBreakHours = row.total_break_hours || 0;
        const totalHours = totalHoursGross - totalBreakHours;
        
        const STANDARD_SHIFT = 8;
        let overtime = 0;
        let status = 'Present';
        
        if (totalHours < 4) {
            status = 'Half Day';
        } else if (totalHours > STANDARD_SHIFT) {
            overtime = totalHours - STANDARD_SHIFT;
        }

        // Upload selfie to Firebase Storage (avoids Firestore 1MB document limit)
        const photo_out_url = await uploadPhotoToStorage(photo_out, `attendance/checkout/${userId}`);

        await db.collection('attendance').doc(attendanceId).update({
            check_out: timestamp,
            location_out: JSON.stringify({ latitude, longitude }),
            photo_out: photo_out_url,
            checkout_device_id: device_id || 'Browser/Unknown',
            total_hours: parseFloat(totalHours.toFixed(2)),
            overtime_hours: parseFloat(overtime.toFixed(2)),
            status: status
        });
        
        res.json({ message: "Checked out successfully", timestamp, totalHours: totalHours.toFixed(2), overtime: overtime.toFixed(2) });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance/break-start', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const timestamp = new Date().toISOString();
        
        const snapshot = await db.collection('attendance')
            .where('user_id', '==', userId)
            .get();

        let targetDocs = [];
        snapshot.forEach(doc => { if(doc.data().check_out === null) targetDocs.push(doc); });

        if (targetDocs.length === 0) return res.status(400).json({ error: "No active check-in found" });
        targetDocs.sort((a, b) => new Date(b.data().check_in) - new Date(a.data().check_in));
        const docId = targetDocs[0].id;

        await db.collection('attendance').doc(docId).update({ break_start: timestamp });
        res.json({ message: "Break started", timestamp });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance/break-end', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const timestamp = new Date().toISOString();
        
        const snapshot = await db.collection('attendance')
            .where('user_id', '==', userId)
            .get();

        let targetDocs = [];
        snapshot.forEach(doc => { if(doc.data().check_out === null) targetDocs.push(doc); });

        if (targetDocs.length === 0) return res.status(400).json({ error: "No active shift found" });
        targetDocs.sort((a, b) => new Date(b.data().check_in) - new Date(a.data().check_in));
        const docRef = targetDocs[0];
        const row = docRef.data();

        if (!row.break_start) return res.status(400).json({ error: "No ongoing break found" });
        
        const bStart = new Date(row.break_start);
        const bEnd = new Date(timestamp);
        const diffHours = (bEnd.getTime() - bStart.getTime()) / (1000 * 60 * 60);
        const newTotalBreaks = (row.total_break_hours || 0) + diffHours;
        
        await db.collection('attendance').doc(docRef.id).update({
            break_start: null,
            break_end: timestamp,
            total_break_hours: parseFloat(newTotalBreaks.toFixed(2))
        });

        res.json({ message: "Break ended", timestamp, addedBreakHours: diffHours.toFixed(2) });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance/correction', authenticateToken, async (req, res) => {
    try {
        const { attendance_id, reason } = req.body;
        await db.collection('attendance').doc(String(attendance_id)).update({
            correction_request: reason,
            correction_status: 'pending'
        });
        
        await db.collection('notifications').add({
             user_id: String(req.user.id),
             type: 'Correction Request',
             message: `Correction requested for reason: ${reason}`,
             created_at: new Date().toISOString(),
             username: req.user.username || 'Employee'
        });
        
        res.json({ message: "Correction requested successfully" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance/history', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const snapshot = await db.collection('attendance')
            .where('user_id', '==', userId)
            // Note: Cloud Firestore requires composite indexing for where() + orderBy() on different fields.
            // Client dashboard usually needs to be explicitly created. Without it, the orderBy locally.
            // Sorting locally for now to avoid the error.
            .get();
        let rows = [];
        snapshot.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
        rows.sort((a, b) => new Date(b.check_in) - new Date(a.check_in));
        
        res.json({ data: rows });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
        
        const data = userDoc.data();
        delete data.password;
        data.id = userDoc.id;
        res.json({ data });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/salary-slips', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists || userDoc.data().can_view_slip !== 1) {
            return res.json({ data: [] });
        }
        
        const snapshot = await db.collection('salary_slips')
            .where('user_id', '==', userId)
            .get();
        
        let rows = [];
        snapshot.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
        
        res.json({ data: rows });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Toll Collection
// ----------------------------------------------------
app.get('/api/admin/payroll', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { month, year } = req.query; // e.g., month=03, year=2026
        
        // Fetch all non-admin users
        const usersSnap = await db.collection('users').where('role', '!=', 'admin').get();
        const users = [];
        const allowed = await getAllowedUserIds(req);
        usersSnap.forEach(doc => { 
            if (allowed && !allowed.has(doc.id)) return;
            users.push({ id: doc.id, ...doc.data() }); 
        });
        
        // Fetch attendance for these dates
        const attendanceSnap = await db.collection('attendance').where('check_out', '!=', null).get();
        const rawAttendance = [];
        attendanceSnap.forEach(doc => { rawAttendance.push({ id: doc.id, ...doc.data() }); });
        
        // Filter attendance locally for the specific month/year
        const targetString = `${year}-${String(month).padStart(2,'0')}`;
        const filteredAttendance = rawAttendance.filter(a => a.check_in && a.check_in.startsWith(targetString));

        const payrollData = users.map(user => {
            const userAtt = filteredAttendance.filter(a => a.user_id === user.id);
            const days_attended = userAtt.length;
            const total_overtime = userAtt.reduce((sum, a) => sum + (parseFloat(a.overtime_hours) || 0), 0);
            
            let dailyRate = 0;
            if (user.salary_structure) {
                try {
                    const struct = JSON.parse(user.salary_structure);
                    dailyRate = parseFloat(struct.daily_rate) || 0;
                } catch(e) {}
            }
            
            const overtime_rate = (dailyRate / 8) * 1.5; 
            const calculated_salary = (days_attended * dailyRate) + (total_overtime * overtime_rate);

            return {
                id: user.id,
                username: user.username,
                days_attended: days_attended,
                total_overtime: total_overtime.toFixed(1),
                daily_rate: dailyRate,
                calculated_salary: calculated_salary.toFixed(2)
            };
        });
        
        res.json({ data: payrollData });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/salary-slips', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { user_id, month_year, total_days, attended_days, overtime_hours, total_salary } = req.body;
        const result = await db.collection('salary_slips').add({
            user_id: String(user_id),
            month_year,
            total_days: parseInt(total_days) || 0,
            attended_days: parseInt(attended_days) || 0,
            overtime_hours: parseFloat(overtime_hours) || 0,
            total_salary: parseFloat(total_salary) || 0,
            slip_url: `/api/user/salary-slips/download`
        });
        
        await db.collection('notifications').add({
            user_id: String(user_id),
            type: 'Payroll Update',
            message: `Your salary slip for ${month_year} has been auto-generated.`,
            created_at: new Date().toISOString(),
            username: 'Head Office'
        });
        
        res.json({ message: "Salary slip generated", id: result.id });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/toll', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { shift, lane_number, num_vehicles, amount, payment_mode } = req.body;
        const date = new Date().toISOString().split('T')[0];

        const result = await db.collection('toll_collections').add({
            user_id: userId,
            date,
            shift,
            lane_number,
            num_vehicles: parseInt(num_vehicles) || 1,
            amount: parseFloat(amount) || 0,
            payment_mode,
            timestamp: new Date().toISOString()
        });
        res.status(201).json({ id: result.id, message: "Toll registered successfully" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/toll', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const snapshot = await db.collection('toll_collections').where('user_id', '==', userId).get();
        let rows = [];
        snapshot.forEach(doc => { rows.push({ id: doc.id, ...doc.data() }); });
        rows.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)); // Sort by newest
        res.json({ data: rows });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/toll', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('toll_collections').get();
        let rows = [];
        const userMap = {};
        const userDocs = await db.collection('users').get();
        userDocs.forEach(d => userMap[d.id] = d.data().username);
        const allowed = await getAllowedUserIds(req);

        snapshot.forEach(doc => {
            const data = doc.data();
            if (allowed && !allowed.has(data.user_id)) return;
            data.id = doc.id;
            data.username = userMap[data.user_id] || 'Unknown';
            rows.push(data);
        });
        
        res.json({ data: rows });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Dashboard Status Overview
// ----------------------------------------------------
app.get('/api/admin/dashboard-stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const date = new Date().toISOString().split('T')[0];
        const stats = { totalEmployees: 0, todayAttendance: 0, todayTollCollection: 0 };
        
        const usersSnap = await db.collection('users').where('active', '==', 1).get();
        stats.totalEmployees = usersSnap.docs.filter(d => d.data().role !== 'admin').length;

        // Note: For large scale, you don't do this locally. Only doing since Firebase functions don't like partial string indices.
        const attendanceSnap = await db.collection('attendance').get();
        const uniqueSet = new Set();
        attendanceSnap.forEach(d => {
            const data = d.data();
            if (data.check_in && data.check_in.startsWith(date)) {
                uniqueSet.add(data.user_id);
            }
        });
        stats.todayAttendance = uniqueSet.size;

        const tollsSnap = await db.collection('toll_collections').where('date', '==', date).get();
        tollsSnap.forEach(d => {
            stats.todayTollCollection += parseFloat(d.data().amount) || 0;
        });

        res.json({ data: stats });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Leave Management
// ----------------------------------------------------
app.post('/api/leave', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const { type, start_date, end_date, reason } = req.body;
        
        const result = await db.collection('leave_requests').add({
            user_id: userId,
            type,
            start_date,
            end_date,
            reason,
            status: 'pending'
        });
        res.status(201).json({ id: result.id, message: "Leave requested successfully" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/leave', authenticateToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const snapshot = await db.collection('leave_requests').where('user_id', '==', userId).get();
        let rows = [];
        snapshot.forEach(doc => { rows.push({ id: doc.id, ...doc.data() }); });
        
        rows.sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
        res.json({ data: rows });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/leave', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('leave_requests').get();
        let rows = [];
        
        const userMap = {};
        const userDocs = await db.collection('users').get();
        userDocs.forEach(d => userMap[d.id] = d.data().username);
        const allowed = await getAllowedUserIds(req);

        snapshot.forEach(doc => {
            const data = doc.data();
            if (allowed && !allowed.has(data.user_id)) return;
            data.id = doc.id;
            data.username = userMap[data.user_id] || 'Unknown';
            rows.push(data);
        });
        
        res.json({ data: rows });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/leave/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // approved, rejected
        const managerId = String(req.user.id);

        await db.collection('leave_requests').doc(id).update({
            status,
            manager_id: managerId
        });
        
        // Notify user about leave update
        const leaveDoc = await db.collection('leave_requests').doc(id).get();
        if (leaveDoc.exists) {
             await db.collection('notifications').add({
                 user_id: leaveDoc.data().user_id,
                 type: 'Leave Update',
                 message: `Your leave request has been ${status}`,
                 created_at: new Date().toISOString(),
                 username: 'Manager'
             });
        }
        
        res.json({ message: `Leave ${status}` });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Toll Plaza Inventory & Expenses
// ----------------------------------------------------
app.get('/api/admin/inventory', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('inventory').orderBy('date', 'desc').get();
        let rows = [];
        const allowed = await getAllowedUserIds(req);
        
        const userMap = {};
        const userDocs = await db.collection('users').get();
        userDocs.forEach(d => userMap[d.id] = d.data().username);
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (allowed && !allowed.has(data.user_id)) return;
            rows.push({ id: doc.id, username: userMap[data.user_id] || 'Unknown', ...data });
        });
        
        res.json({ data: rows });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/inventory', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { type, amount, description, date } = req.body;
        const result = await db.collection('inventory').add({
            user_id: String(req.user.id),
            type, // 'Petty Cash', 'Expense', 'Equipment'
            amount: parseFloat(amount) || 0,
            description: description || 'No Description',
            date: date || new Date().toISOString().split('T')[0],
            status: 'submitted' 
        });
        res.status(201).json({ id: result.id, message: "Inventory/Expense recorded" });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/inventory/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'approved', 'rejected'
        await db.collection('inventory').doc(id).update({ status });
        res.json({ message: `Expense ${status}` });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/user/:id/toggle-slip', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await db.collection('users').doc(id).get();
        if(!doc.exists) return res.status(404).json({error: "User not found"});
        const cur = doc.data().can_view_slip;
        const next = cur === 1 ? 0 : 1;
        await db.collection('users').doc(id).update({ can_view_slip: next });
        res.json({ message: "Salary slip visibility toggled", can_view_slip: next });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Local development server (Vercel ignores this and uses module.exports below)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// Export for Vercel serverless
module.exports = app;
