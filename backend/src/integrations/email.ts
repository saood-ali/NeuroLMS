import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { NotificationLog, NotificationType } from '../models/NotificationLog';
import mongoose from 'mongoose';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 587,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  type: NotificationType;
  userId?: mongoose.Types.ObjectId | string;
}

export const sendEmail = async ({ to, subject, html, type, userId }: SendEmailParams): Promise<void> => {
  try {
    await transporter.sendMail({
      from: env.SMTP_FROM || 'noreply@neurolms.com',
      to,
      subject,
      html,
    });

    if (userId) {
      await NotificationLog.create({
        userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
        type,
        status: 'sent',
      }).catch(err => console.error('Failed to log successful notification:', err));
    }
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    
    if (userId) {
      await NotificationLog.create({
        userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
        type,
        status: 'failed',
      }).catch(err => console.error('Failed to log failed notification:', err));
    }
  }
};
