export const emailTemplates = {
  emailVerificationOtp: (otp: string) => `
    <h1>Verify Your Email</h1>
    <p>Your one-time password (OTP) is: <strong>${otp}</strong></p>
    <p>This code will expire in 15 minutes.</p>
  `,
  emailChangeOtp: (otp: string) => `
    <h1>Change Your Email</h1>
    <p>Your one-time password (OTP) to confirm your new email is: <strong>${otp}</strong></p>
    <p>This code will expire in 15 minutes.</p>
  `,
  passwordResetOtp: (otp: string) => `
    <h1>Reset Your Password</h1>
    <p>Your one-time password (OTP) to reset your password is: <strong>${otp}</strong></p>
    <p>This code will expire in 15 minutes.</p>
  `,
  passwordChangeConfirmation: () => `
    <h1>Password Changed</h1>
    <p>Your password was recently changed. If this wasn't you, please contact support immediately.</p>
  `,
  passwordResetConfirmation: () => `
    <h1>Password Reset Successful</h1>
    <p>Your password has been successfully reset.</p>
  `,
  purchaseConfirmation: (courseName: string) => `
    <h1>Purchase Confirmed</h1>
    <p>Thank you for purchasing <strong>${courseName}</strong>!</p>
    <p>You can now access it from your dashboard.</p>
  `,
  paymentFailure: (courseName: string) => `
    <h1>Payment Failed</h1>
    <p>Unfortunately, your payment for <strong>${courseName}</strong> failed. Please try again.</p>
  `,
};
