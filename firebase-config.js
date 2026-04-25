const firebaseConfig = {
  apiKey: "AIzaSyDcU-Gh0FjHeRHVy5A4ezE9H3-94u6aIb4",
  authDomain: "hello-machi-fm-6ebe4.firebaseapp.com",
  projectId: "hello-machi-fm-6ebe4",
  storageBucket: "hello-machi-fm-6ebe4.firebasestorage.app",
  messagingSenderId: "878660002110",
  appId: "1:878660002110:web:bdf20cfa8bdb8ae2f8cc6f",
  measurementId: "G-2PH33CYFHY"
};

// Initialize Firebase (guard against duplicate init)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();
