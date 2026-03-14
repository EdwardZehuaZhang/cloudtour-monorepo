import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
    from: "CloudTour <noreply@cloudtour.app>",
    to,
    subject: `You've been invited to join ${orgName} on CloudTour`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background-color: #f8f6f3;">
        <h1 style="color: #3a3530; font-size: 24px; margin-bottom: 16px;">
          Join ${orgName} on CloudTour
        </h1>
        <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
          You've been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong>.
        </p>
        <p style="color: #5a5550; font-size: 16px; line-height: 1.6;">
          CloudTour is a platform for creating immersive 3D virtual tours using Gaussian splatting technology.
        </p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${inviteUrl}"
             style="display: inline-block; padding: 12px 32px; background-color: #2b2d7a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">
            Accept Invitation
          </a>
        </div>
        <p style="color: #8a8580; font-size: 14px; line-height: 1.5;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e0db; margin: 32px 0;" />
        <p style="color: #8a8580; font-size: 12px;">
          CloudTour &mdash; Spatial tours for the places worth remembering.
        </p>
      </div>
    `,
  });
}
