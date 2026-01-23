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

/**
 * db.js (short documentation)
 * --------------------------
 * Small helper functions for working with Firestore.
 *
 * Firestore structure used in this project:
 * - users/{uid}/children/{childId}                     → child profile
 * - users/{uid}/children/{childId}/assessments/{docId} → assessments history
 * - users/{uid}/children/{childId}/chat/{docId}        → chat messages
 *
 * Notes:
 * - serverTimestamp() is used so timestamps are created by Firebase server time
 *   (more reliable than client time).
 */

// create/update child
export async function upsertChild(uid, childId, childData) {
  /**
   * upsertChild
   * -----------
   * Creates or updates a child profile document.
   *
   * Inputs:
   * - uid: user id (Firebase Auth)
   * - childId: document id for the child
   * - childData: fields like { childName, age, gender, weight, height, symptoms, notes }
   *
   * Behavior:
   * - Uses setDoc(..., { merge: true }) so it updates only provided fields
   * - Always updates updatedAt
   * - Sets createdAt only if it doesn't already exist
   */
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
  /**
   * addAssessment
   * -------------
   * Adds a new assessment document under the selected child.
   *
   * Inputs:
   * - payload: usually includes { form: {...}, assessmentResult: "..." }
   *
   * Output:
   * - returns the created document reference (docRef)
   */
  const ref = collection(db, `users/${uid}/children/${childId}/assessments`);
  const docRef = await addDoc(ref, {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return docRef;
}

export async function addChatMessage(uid, childId, role, text) {
  /**
   * addChatMessage
   * --------------
   * Adds a chat message for a child.
   *
   * Inputs:
   * - role: "user" or "assistant"
   * - text: message content
   *
   * Output:
   * - returns the created document reference (docRef)
   */
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
  /**
   * getLatestAssessment
   * -------------------
   * Utility function that returns the most recent assessment for a child.
   *
   * How it works:
   * - Orders assessments by createdAt descending
   * - Limits to 1 document
   *
   * Returns:
   * - null if there are no assessments
   * - otherwise: { id, ...data }
   */
  const ref = collection(db, `users/${uid}/children/${childId}/assessments`);
  const snap = await getDocs(query(ref, orderBy("createdAt", "desc"), limit(1)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
