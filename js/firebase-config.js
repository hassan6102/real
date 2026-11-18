

// نقطة الاستيراد الوحيدة لـ Firebase (Modular SDK)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// استبدل هذا الجزء فقط ببيانات مشروعك من Firebase
export const firebaseConfig = {
apiKey: "AIzaSyCjTrKeCj6fNKJc8DwRaDZfYKB8ldUA-Lc",
  authDomain: "real-estate-team-98ff5.firebaseapp.com",
  projectId: "real-estate-team-98ff5",
  storageBucket: "real-estate-team-98ff5.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};


// الأسطر التالية هي التي تسببت في الخطأ لأنها حُذفت - يجب أن تبقى كما هي
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// استيراد وتصدير الدوال المستخدمة في باقي ملفات المشروع
export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export {
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit,
  onSnapshot, getCountFromServer, serverTimestamp, Timestamp, writeBatch, runTransaction, 
  startAfter 
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';