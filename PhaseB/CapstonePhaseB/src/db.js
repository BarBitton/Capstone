import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";

// create/update child
export async function upsertChild(uid, childId, childData) {
  const ref = doc(db, `users/${uid}/children/${childId}`);
  await setDoc(
    ref,
    {
      ...childData,
      updatedAt: serverTimestamp(),
      createdAt: childData.createdAt || serverTimestamp(),
    },
    { merge: true }
  );
  return ref;
}

export async function addAssessment(uid, childId, payload) {
  const ref = collection(db, `users/${uid}/children/${childId}/assessments`);
  const docRef = await addDoc(ref, {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return docRef;
}

export async function addChatMessage(uid, childId, role, text) {
  const ref = collection(db, `users/${uid}/children/${childId}/chat`);
  const docRef = await addDoc(ref, {
    role,
    text,
    createdAt: serverTimestamp(),
  });
  return docRef;
}

// get latest assessment (optional helper)
export async function getLatestAssessment(uid, childId) {
  const ref = collection(db, `users/${uid}/children/${childId}/assessments`);
  const snap = await getDocs(query(ref, orderBy("createdAt", "desc"), limit(1)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
