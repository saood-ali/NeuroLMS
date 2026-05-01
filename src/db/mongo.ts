import mongoose from 'mongoose';
import { env } from '../config/env';

export const connectMongo = async (): Promise<void> => {
  try {
    if (!env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log('Successfully connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Failure causes startup to abort
  }
};
