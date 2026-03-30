import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { ActivityLog } from '../types';

export async function logActivity(userId: string, userName: string, action: string, details: string) {
  if (!userId || !userName) {
    console.warn("Attempted to log activity without userId or userName");
    return;
  }
  try {
    const log: ActivityLog = {
      userId,
      userName,
      action,
      details,
      timestamp: new Date().toISOString()
    };
    await addDoc(collection(db, 'logs'), log);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'logs');
  }
}
