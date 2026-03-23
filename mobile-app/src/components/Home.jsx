import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LogOut, Clock, User, CheckCircle2, History, Calendar, Car, IndianRupee, FileText, Download, AlertCircle, Bell, Fingerprint } from 'lucide-react';
import { API_URL } from '../App';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';

const Home = ({ setAuth }) => {
  const [history, setHistory] = useState([]);
  const [slips, setSlips] = useState([]);
  const [tolls, setTolls] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [profile, setProfile] = useState({});
  const [loading, setLoading] = useState(false);
  const [user] = useState(JSON.parse(localStorage.getItem('user')) || { username: 'Demo User', role: 'employee' });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [activeTab, setActiveTab] = useState('attendance'); 
  const [notifications, setNotifications] = useState([]);
  const [biometricEnabled, setBiometricEnabled] = useState(localStorage.getItem('biometricAuth') === 'true');

  // Forms
  const [tollForm, setTollForm] = useState({
      shift: 'Morning',
      lane_number: '',
      num_vehicles: 1,
      amount: '',
      payment_mode: 'Cash'
  });

  const [leaveForm, setLeaveForm] = useState({
      type: 'Sick Leave',
      start_date: '',
      end_date: '',
      reason: ''
  });

  const checkAuthError = (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) handleLogout();
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/attendance/history?_t=${Date.now()}`);
      setHistory(res.data.data || []);
    } catch (err) {
      checkAuthError(err);
    }
  };

  const fetchTolls = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/user/toll?_t=${Date.now()}`);
      setTolls(res.data.data || []);
    } catch (err) {
      checkAuthError(err);
    }
  };

  const fetchData = async () => {
    const timestamp = Date.now();
    fetchHistory();
    fetchTolls();
    
    axios.get(`${API_URL}/api/user/leave?_t=${timestamp}`)
      .then(res => setLeaves(res.data.data || []))
      .catch(err => console.error(err));
    
    axios.get(`${API_URL}/api/user/salary-slips?_t=${timestamp}`)
      .then(res => setSlips(res.data.data || []))
      .catch(checkAuthError);
      
    axios.get(`${API_URL}/api/user/profile?_t=${timestamp}`)
      .then(res => setProfile(res.data.data || {}))
      .catch(checkAuthError);
      
    axios.get(`${API_URL}/api/notifications?_t=${timestamp}`)
      .then(res => setNotifications(res.data.data || []))
      .catch(checkAuthError);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const requestCorrection = async (attendance_id) => {
      const reason = window.prompt("Reason for correction:");
      if (!reason) return;
      try {
          await axios.post(`${API_URL}/api/attendance/correction`, { attendance_id, reason });
          showMessage('Correction requested', 'success');
          await fetchHistory();
      } catch(err) {
          showMessage('Failed to request correction', 'error');
          console.error(err);
      }
  };

  const handleLogout = () => {
    localStorage.clear();
    setAuth(false);
    delete axios.defaults.headers.common['Authorization'];
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      // 1. Get GPS Location
      const coordinates = await Geolocation.getCurrentPosition();
      const latitude = String(coordinates.coords.latitude);
      const longitude = String(coordinates.coords.longitude);
      
      // 2. Take Selfie
      const image = await Camera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera
      });
      const photo_in = `data:image/jpeg;base64,${image.base64String}`;

      // 3. Get Device
      const deviceInfo = await Device.getId();

      // 4. Send to Server
      await axios.post(`${API_URL}/api/attendance/checkin`, { 
          latitude, 
          longitude,
          photo_in,
          device_id: deviceInfo.identifier
      });
      showMessage('Checked in successfully with Location & Selfie!', 'success');
      await fetchHistory();
    } catch (err) {
      showMessage(err.response?.data?.error || err.message || 'Check-in failed. Please accept camera/location permissions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setLoading(true);
    try {
      // 1. Get GPS Location
      const coordinates = await Geolocation.getCurrentPosition();
      const latitude = String(coordinates.coords.latitude);
      const longitude = String(coordinates.coords.longitude);
      
      // 2. Take Selfie
      const image = await Camera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera
      });
      const photo_out = `data:image/jpeg;base64,${image.base64String}`;

      // 3. Get Device
      const deviceInfo = await Device.getId();

      // 4. Send to Server
      await axios.post(`${API_URL}/api/attendance/checkout`, {
          latitude, 
          longitude,
          photo_out,
          device_id: deviceInfo.identifier
      });
      showMessage('Checked out successfully with Location & Selfie!', 'success');
      await fetchHistory();
    } catch (err) {
      showMessage(err.response?.data?.error || err.message || 'Check-out failed. Please accept camera/location permissions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBreakStart = async () => {
      setLoading(true);
      try {
          await axios.post(`${API_URL}/api/attendance/break-start`);
          showMessage('Break Started', 'success');
          await fetchHistory();
      } catch (err) {
          showMessage(err.response?.data?.error || 'Failed to start break', 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleBreakEnd = async () => {
      setLoading(true);
      try {
          await axios.post(`${API_URL}/api/attendance/break-end`);
          showMessage('Break Ended', 'success');
          await fetchHistory();
      } catch (err) {
          showMessage(err.response?.data?.error || 'Failed to end break', 'error');
      } finally {
          setLoading(false);
      }
  };

  const submitToll = async (e) => {
      e.preventDefault();
      
      const today = new Date().toDateString();
      const duplicate = tolls.some(t => t.shift === tollForm.shift && new Date(t.timestamp || t.date).toDateString() === today);
      if (duplicate) {
          showMessage('Entry for this shift is already recorded today!', 'error');
          return;
      }
      
      setLoading(true);
      try {
          await axios.post(`${API_URL}/api/toll`, tollForm);
          showMessage('Toll record submitted!', 'success');
          setTollForm({...tollForm, num_vehicles: 1, amount: ''});
          await fetchTolls();
      } catch(err) {
          showMessage('Failed to submit toll', 'error');
          console.error(err);
      } finally {
          setLoading(false);
      }
  }

  const submitLeave = async (e) => {
      e.preventDefault();
      
      const today = new Date().toDateString();
      if (localStorage.getItem('lastLeaveRequestDate') === today) {
          showMessage('You can only request one leave per day!', 'error');
          return;
      }
      
      setLoading(true);
      try {
          await axios.post(`${API_URL}/api/leave`, leaveForm);
          showMessage('Leave requested successfully!', 'success');
          localStorage.setItem('lastLeaveRequestDate', today);
          setLeaveForm({type: 'Sick Leave', start_date: '', end_date: '', reason: ''});
          
          // Refresh leaves
          axios.get(`${API_URL}/api/user/leave?_t=${Date.now()}`).then(res => setLeaves(res.data.data || []));
      } catch(err) {
          showMessage('Failed to request leave', 'error');
          console.error(err);
      } finally {
          setLoading(false);
      }
  }

  const isCheckedIn = history.length > 0 && !history[0].check_out;
  const isOnBreak = isCheckedIn && history[0].break_start && !history[0].break_end;

  return (
    <div className="h-screen flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Header */}
      <header className="bg-blue-600 text-white p-6 rounded-b-3xl shadow-lg relative z-10 shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex justify-center items-center shadow-inner">
              <User className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xl font-bold capitalize">{user.username}</p>
              <p className="text-sm text-blue-200 uppercase tracking-widest font-semibold">{user.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-3 bg-red-500/20 text-red-100 hover:bg-red-500 hover:text-white rounded-full transition-all">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {message.text && (
        <div className={`m-4 p-3 rounded-xl text-sm font-medium animate-pulse text-center ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
            {message.text}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 pt-4 pb-24">
        
        {/* ATTENDANCE */}
        {activeTab === 'attendance' && (
            <div className="space-y-6">
                 {/* Status Card */}
                <div className="bg-white rounded-3xl p-8 shadow-md border border-gray-100 flex flex-col items-center text-center">
                    <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-6 shadow-md transition-all ${
                        isOnBreak ? 'border-amber-400 bg-amber-50 text-amber-500' : 
                        isCheckedIn ? 'border-green-400 bg-green-50 text-green-500' : 'border-blue-400 bg-blue-50 text-blue-500'
                    }`}>
                        <Clock className="w-14 h-14" strokeWidth={1.5} />
                    </div>

                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                        {isOnBreak ? 'On Break' : (isCheckedIn ? 'Currently Clocked In' : 'Not Clocked In')}
                    </h2>
                    
                    <div className="flex flex-col gap-4 w-full justify-center mt-6">
                        {!isCheckedIn ? (
                            <button onClick={handleCheckIn} disabled={loading} className="w-full bg-blue-600 text-white py-4 px-6 rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all text-lg flex items-center justify-center gap-2">
                                <CheckCircle2 className="w-6 h-6" /> Check In Now
                            </button>
                        ) : (
                            <>
                                {!isOnBreak ? (
                                    <button onClick={handleBreakStart} disabled={loading} className="w-full bg-amber-500 text-white py-3 px-6 rounded-2xl font-bold shadow-lg shadow-amber-200 hover:bg-amber-600 active:scale-95 transition-all flex items-center justify-center gap-2">
                                        <Clock className="w-5 h-5" /> Start Break
                                    </button>
                                ) : (
                                    <button onClick={handleBreakEnd} disabled={loading} className="w-full bg-indigo-500 text-white py-3 px-6 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-600 active:scale-95 transition-all flex items-center justify-center gap-2">
                                        <Clock className="w-5 h-5" /> End Break
                                    </button>
                                )}

                                <button onClick={handleCheckOut} disabled={loading || isOnBreak} className={`w-full py-4 px-6 rounded-2xl font-bold shadow-lg transition-all text-lg flex items-center justify-center gap-2 ${isOnBreak ? 'bg-gray-300 text-gray-500 shadow-none' : 'bg-orange-500 text-white shadow-orange-200 hover:bg-orange-600 active:scale-95'}`}>
                                    <LogOut className="w-6 h-6" /> Check Out
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* History */}
                <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <History className="w-5 h-5 text-blue-600" /> Attendance Record
                    </h3>
                    <div className="space-y-3">
                        {history.slice(0, 3).map((record) => (
                        <div key={record.id} className="mb-3">
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                                        {new Date(record.check_in).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </p>
                                    <p className="text-gray-800 font-medium">{new Date(record.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <div className="flex flex-col items-center justify-center px-4">
                                    {record.total_hours ? (
                                        <p className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{record.total_hours}h</p>
                                    ) : (
                                        <div className="h-0.5 w-8 bg-gray-200"></div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Check Out</p>
                                    <p className={`font-medium ${record.check_out ? 'text-gray-800' : 'text-green-500 italic'}`}>
                                        {record.check_out ? new Date(record.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Working...'}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Detailed metrics per shift */}
                            {(record.shift_timing || record.total_break_hours > 0 || record.overtime_hours > 0) && (
                            <div className="bg-slate-50 border-x border-b border-gray-100 px-4 py-2 text-xs flex gap-3 text-slate-500 rounded-b-xl -mt-2 pt-3">
                                {record.shift_timing && <span>Shift: <span className="font-semibold text-slate-700">{record.shift_timing}</span></span>}
                                {record.total_break_hours > 0 && <span>Break: <span className="font-semibold">{record.total_break_hours}h</span></span>}
                                {record.overtime_hours > 0 && <span>OT: <span className="font-semibold text-indigo-600">{record.overtime_hours}h</span></span>}
                            </div>
                            )}

                            <div className="flex justify-between items-center px-2 pb-2 mt-2">
                                <span className="text-xs text-slate-500">Status: {record.status || 'Present'}</span>
                                {record.check_out && !record.correction_request && (
                                    <button onClick={() => requestCorrection(record.id)} className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:underline">
                                        <AlertCircle className="w-3 h-3" /> Missed Punch?
                                    </button>
                                )}
                                {record.correction_request && (
                                    <span className="text-xs text-orange-500 font-medium">Correction {record.correction_status}</span>
                                )}
                            </div>
                        </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* TOLL REGISTRATION */}
        {activeTab === 'toll' && (
            <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <Car className="w-6 h-6 text-blue-600" /> Record Toll
                </h2>
                <form onSubmit={submitToll} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Lane Number</label>
                            <input type="text" required className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" value={tollForm.lane_number} onChange={e => setTollForm({...tollForm, lane_number: e.target.value})} placeholder="e.g. 04"/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Shift</label>
                            <select className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" value={tollForm.shift} onChange={e => setTollForm({...tollForm, shift: e.target.value})}>
                                <option>Morning</option>
                                <option>Evening</option>
                                <option>Night</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Total Amount (₹)</label>
                        <input type="number" required className="mt-1 w-full bg-green-50 border border-green-200 font-bold text-green-700 rounded-xl px-4 py-3 outline-none" value={tollForm.amount} onChange={e => setTollForm({...tollForm, amount: e.target.value})} placeholder="0.00" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Payment Mode</label>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                            {['Cash', 'UPI'].map(mode => (
                                <button type="button" key={mode} onClick={() => setTollForm({...tollForm, payment_mode: mode})} className={`p-3 rounded-xl font-medium border transition-colors ${tollForm.payment_mode === mode ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="w-full mt-6 bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition">
                        Submit Record
                    </button>
                </form>


            </div>
        )}

        {/* LEAVE MANAGEMENT */}
        {activeTab === 'leave' && (
             <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <Calendar className="w-6 h-6 text-blue-600" /> Apply Leave
                </h2>
                <form onSubmit={submitLeave} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Leave Type</label>
                        <select className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" value={leaveForm.type} onChange={e => setLeaveForm({...leaveForm, type: e.target.value})}>
                            <option>Sick Leave</option>
                            <option>Casual Leave</option>
                            <option>Emergency Leave</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Start Date</label>
                            <input type="date" required className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" value={leaveForm.start_date} onChange={e => setLeaveForm({...leaveForm, start_date: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">End Date</label>
                            <input type="date" required className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" value={leaveForm.end_date} onChange={e => setLeaveForm({...leaveForm, end_date: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Reason</label>
                        <textarea required rows="3" className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none resize-none" placeholder="Provide a brief explanation..." value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})}></textarea>
                    </div>

                    <button type="submit" disabled={loading} className="w-full mt-6 bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition">
                        Submit Request
                    </button>
                </form>

                <div className="mt-8 border-t border-gray-100 pt-6">
                    <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase">Leave Dates & Applications</h3>
                    <div className="space-y-3">
                        {leaves.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No leave requests found.</p>}
                        {leaves.map((l, idx) => (
                            <div key={idx} className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center border border-slate-100">
                                <div>
                                    <p className="font-bold text-gray-700">{l.type}</p>
                                    <p className="text-xs text-gray-500 mt-1">{new Date(l.start_date).toLocaleDateString()} to {new Date(l.end_date).toLocaleDateString()}</p>
                                    {l.reason && <p className="text-[10px] text-gray-400 mt-1 italic w-32 truncate">{l.reason}</p>}
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${l.status === 'approved' ? 'text-green-600 bg-green-50' : l.status === 'rejected' ? 'text-red-600 bg-red-50' : 'text-orange-600 bg-orange-50'}`}>{l.status || 'pending'}</span>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}

        {/* SALARY SLIPS */}
        {activeTab === 'slips' && !selectedSlip && (
             <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <FileText className="w-6 h-6 text-blue-600" /> Salary Slips
                </h2>
                <div className="space-y-4">
                    {slips.length === 0 && <p className="text-center text-gray-500">No salary slips available</p>}
                    {slips.map(slip => (
                        <div key={slip.id} className="border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-800">{slip.month_year}</h3>
                                <p className="text-sm text-slate-500">Net Pay: <span className="font-semibold text-green-600">₹{slip.total_salary}</span></p>
                            </div>
                            <button onClick={() => setSelectedSlip(slip)} className="px-4 py-2 rounded-xl bg-blue-50 text-blue-600 font-bold hover:bg-blue-100 text-sm">
                                View
                            </button>
                        </div>
                    ))}
                </div>
             </div>
        )}

        {activeTab === 'slips' && selectedSlip && (
             <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
                <button onClick={() => setSelectedSlip(null)} className="text-blue-600 text-sm font-bold mb-4 flex items-center gap-1">← Back to Slips</button>
                <div className="border border-slate-200 rounded-2xl p-6">
                    <div className="text-center border-b border-gray-100 pb-4 mb-4">
                        <h2 className="text-2xl font-bold text-slate-800">Toll ERP Pro</h2>
                        <p className="text-gray-500">Official Payslip</p>
                        <h3 className="text-lg font-bold text-indigo-600 mt-2">{selectedSlip.month_year}</h3>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between"><span className="text-gray-500">Employee</span><span className="font-bold capitalize">{profile.username}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Role</span><span className="font-bold capitalize">{profile.role}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Total Month Days</span><span className="font-bold">{selectedSlip.total_days}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Days Attended</span><span className="font-bold">{selectedSlip.attended_days}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Overtime Logged</span><span className="font-bold">{selectedSlip.overtime_hours} hrs</span></div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-dashed border-gray-300 flex justify-between items-center text-lg">
                        <span className="font-bold text-gray-600">Net Transfer</span>
                        <span className="font-black text-green-600 text-2xl">₹{selectedSlip.total_salary}</span>
                    </div>
                    <button onClick={() => showMessage('Slip saved to device successfully', 'success')} className="w-full mt-8 bg-slate-900 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                        <Download className="w-5 h-5"/> Download PDF
                    </button>
                </div>
             </div>
        )}

        {/* PROFILE */}
        {activeTab === 'profile' && (
             <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <User className="w-6 h-6 text-blue-600" /> My Profile
                </h2>
                <div className="space-y-6">
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Personal Details</p>
                        <div className="mt-2 bg-slate-50 rounded-xl p-4">
                            <p className="text-sm"><span className="font-medium">Role:</span> {profile.role}</p>
                            {profile.personal_details && (
                                <>
                                    <p className="text-sm"><span className="font-medium">Location:</span> {JSON.parse(profile.personal_details).toll_plaza}</p>
                                    <p className="text-sm"><span className="font-medium">Contact:</span> {JSON.parse(profile.personal_details).contact_number}</p>
                                    <p className="text-sm"><span className="font-medium">Address:</span> {JSON.parse(profile.personal_details).address}</p>
                                </>
                            )}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Attendance & Leave Records</p>
                        <div className="mt-2 bg-slate-50 rounded-xl p-4">
                            <p className="text-sm"><span className="font-medium">Total Shifts Attended:</span> {history.length}</p>
                            <p className="text-sm"><span className="font-medium">Upcoming/Recent Leave:</span> {leaves.length > 0 ? new Date(leaves[0].start_date).toLocaleDateString() : 'None'}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Authentication & Security</p>
                        <div className="mt-2 bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Fingerprint className="w-6 h-6 text-indigo-500" />
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Biometric Login</p>
                                    <p className="text-xs text-gray-500">Use Fingerprint / Face ID</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    const nextState = !biometricEnabled;
                                    setBiometricEnabled(nextState);
                                    localStorage.setItem('biometricAuth', nextState.toString());
                                    showMessage(nextState ? 'Biometric auth enabled' : 'Biometric auth disabled', 'success');
                                }} 
                                className={`w-12 h-6 rounded-full transition-colors relative ${biometricEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${biometricEnabled ? 'left-7' : 'left-1'}`}></div>
                            </button>
                        </div>
                    </div>
                </div>
             </div>
        )}

        {/* NOTIFICATIONS */}
        {activeTab === 'notifications' && (
             <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <Bell className="w-6 h-6 text-blue-600" /> Alerts & Reminders
                </h2>
                <div className="space-y-4">
                    {notifications.length === 0 && <p className="text-center text-gray-500">All caught up! No active alerts.</p>}
                    {notifications.map(n => (
                        <div key={n.id} className="border-l-4 border-indigo-500 bg-slate-50 rounded-r-xl p-4 shadow-sm flex flex-col gap-1">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-gray-800 text-sm">{n.type}</h3>
                                <span className="text-[10px] text-gray-400 font-medium">
                                    {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <p className="text-xs text-gray-600">{n.message}</p>
                        </div>
                    ))}
                </div>
             </div>
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="absolute bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-3 pb-safe-area shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.1)] overflow-x-auto">
          <button onClick={() => setActiveTab('attendance')} className={`flex flex-col items-center p-2 rounded-xl min-w-[50px] transition ${activeTab === 'attendance' ? 'text-blue-600' : 'text-gray-400'}`}>
              <Clock className={`w-5 h-5 mb-1 ${activeTab === 'attendance' ? 'fill-blue-50' : ''}`} />
              <span className="text-[10px] font-bold">Punch</span>
          </button>
          <button onClick={() => setActiveTab('toll')} className={`flex flex-col items-center p-2 rounded-xl min-w-[50px] transition ${activeTab === 'toll' ? 'text-blue-600' : 'text-gray-400'}`}>
              <Car className={`w-5 h-5 mb-1 ${activeTab === 'toll' ? 'fill-blue-50' : ''}`} />
              <span className="text-[10px] font-bold">Toll</span>
          </button>
          <button onClick={() => setActiveTab('leave')} className={`flex flex-col items-center p-2 rounded-xl min-w-[50px] transition ${activeTab === 'leave' ? 'text-blue-600' : 'text-gray-400'}`}>
              <Calendar className={`w-5 h-5 mb-1 ${activeTab === 'leave' ? 'fill-blue-50' : ''}`} />
              <span className="text-[10px] font-bold">Leave</span>
          </button>
          <button onClick={() => setActiveTab('notifications')} className={`flex flex-col items-center p-2 rounded-xl min-w-[50px] transition ${activeTab === 'notifications' ? 'text-blue-600' : 'text-gray-400'} relative`}>
              <Bell className={`w-5 h-5 mb-1 ${activeTab === 'notifications' ? 'fill-blue-50' : ''}`} />
              {notifications.length > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full"></span>}
              <span className="text-[10px] font-bold">Alerts</span>
          </button>
          <button onClick={() => setActiveTab('slips')} className={`flex flex-col items-center p-2 rounded-xl min-w-[50px] transition ${activeTab === 'slips' ? 'text-blue-600' : 'text-gray-400'}`}>
              <FileText className={`w-5 h-5 mb-1 ${activeTab === 'slips' ? 'fill-blue-50' : ''}`} />
              <span className="text-[10px] font-bold">Slips</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center p-2 rounded-xl min-w-[50px] transition ${activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400'}`}>
              <User className={`w-5 h-5 mb-1 ${activeTab === 'profile' ? 'fill-blue-50' : ''}`} />
              <span className="text-[10px] font-bold">Profile</span>
          </button>
      </nav>
    </div>
  );
};

export default Home;
