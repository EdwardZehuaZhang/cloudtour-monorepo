import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const FROM = "CloudTour <noreply@cloudtour.app>";

function emailWrapper(content: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background-color: #f8f6f3;">
      ${content}
      <hr style="border: none; border-top: 1px solid #e5e0db; margin: 32px 0;" />
      <p style="color: #8a8580; font-size: 12px;">
        CloudTour &mdash; Spatial tours for the places worth remembering.
      </p>
    </div>
  `;
}

function ctaButton(text: string, href: string): string {
  return `
    <div style="margin: 32px 0; text-align: center;">
      <a href="${href}"
         style="display: inline-block; padding: 12px 32px; background-color: #2b2d7a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">
        ${text}
      </a>
    </div>
  `;
}

// --- Welcome Email ---

interface WelcomeEmailParams {
  to: string;
  displayName: string;
}

export async function sendWelcomeEmail({
  to,
  displayName,
}: WelcomeEmailParams) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Welcome to CloudTour",
    html: emailWrapper(`
      <h1 style="color: #3a3530; font-size: 24px; margin-bottom: 16px;">
        Welcome to CloudTour, ${displayName}!
      </h1>
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        Your account is ready. CloudTour lets you create immersive 3D virtual tours
        using Gaussian splatting technology &mdash; no special hardware required.
      </p>
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        Here&rsquo;s how to get started:
      </p>
      <ol style="color: #5a5550; font-size: 16px; line-height: 1.8; padding-left: 20px;">
        <li>Create your first tour from the dashboard</li>
        <li>Upload a .ply, .splat, or .spz scene file</li>
        <li>Add waypoints and hotspots to make it interactive</li>
        <li>Publish and share with the world</li>
      </ol>
      ${ctaButton("Go to Dashboard", `${APP_URL}/dashboard`)}
      <p style="color: #8a8580; font-size: 14px; line-height: 1.5;">
        If you have any questions, visit our <a href="${APP_URL}/contact" style="color: #2b2d7a;">contact page</a>.
      </p>
    `),
  });
}

// --- Tour Published Notification ---

interface TourPublishedEmailParams {
  to: string;
  tourTitle: string;
  tourSlug: string;
}

export async function sendTourPublishedEmail({
  to,
  tourTitle,
  tourSlug,
}: TourPublishedEmailParams) {
  const tourUrl = `${APP_URL}/tours/${tourSlug}`;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Your tour "${tourTitle}" is now live!`,
    html: emailWrapper(`
      <h1 style="color: #3a3530; font-size: 24px; margin-bottom: 16px;">
        Your tour is live!
      </h1>
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        <strong>${tourTitle}</strong> has been published and is now available for everyone to explore.
      </p>
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        Share the link with your audience or embed it on your website.
      </p>
      ${ctaButton("View Your Tour", tourUrl)}
      <p style="color: #8a8580; font-size: 14px; line-height: 1.5;">
        You can manage your tour from the <a href="${APP_URL}/dashboard" style="color: #2b2d7a;">dashboard</a>.
      </p>
    `),
  });
}

// --- Password Reset Email ---

interface PasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: PasswordResetEmailParams) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Reset your CloudTour password",
    html: emailWrapper(`
      <h1 style="color: #3a3530; font-size: 24px; margin-bottom: 16px;">
        Reset your password
      </h1>
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        We received a request to reset the password for your CloudTour account.
        Click the button below to choose a new password.
      </p>
      ${ctaButton("Reset Password", resetUrl)}
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        This link will expire in 1 hour. If you didn&rsquo;t request a password reset,
        you can safely ignore this email.
      </p>
    `),
  });
}

// --- Member Invite Email ---

interface InviteEmailParams {
  to: string;
  orgName: string;
  inviteToken: string;
  role: string;
}

export async function sendInviteEmail({
  to,
  orgName,
  inviteToken,
  role,
}: InviteEmailParams) {
  const inviteUrl = `${APP_URL}/invite/${inviteToken}`;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: `You've been invited to join ${orgName} on CloudTour`,
    html: emailWrapper(`
      <h1 style="color: #3a3530; font-size: 24px; margin-bottom: 16px;">
        Join ${orgName} on CloudTour
      </h1>
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        You've been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong>.
      </p>
      <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
        CloudTour is a platform for creating immersive 3D virtual tours using Gaussian splatting technology.
      </p>
      ${ctaButton("Accept Invitation", inviteUrl)}
      <p style="color: #8a8580; font-size: 14px; line-height: 1.5;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    `),
  });
}
