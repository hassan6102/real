// نقطة الاستيراد الوحيدة لـ Firebase (Modular SDK). غيّر رقم النسخة هنا فقط.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ضع بيانات مشروعك من: Firebase Console > Project settings > Your apps > Web app
// (هذه القيم ليست أسرارًا؛ الحماية الفعلية في firestore.rules)
// استبدل هذا الجزء فقط ببيانات مشروعك من Firebase
export const firebaseConfig = {
apiKey: "AIzaSyCjTrKeCj6fNKJc8DwRaDZfYKB8ldUA-Lc",
  authDomain: "real-estate-team-98ff5.firebaseapp.com",
  projectId: "real-estate-team-98ff5",
  storageBucket: "real-estate-team-98ff5.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
export {
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where, orderBy, limit,
  onSnapshot, getCountFromServer, serverTimestamp, Timestamp,
  startAfter, runTransaction, writeBatch, deleteDoc, collectionGroup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
