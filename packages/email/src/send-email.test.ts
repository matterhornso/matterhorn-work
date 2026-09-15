import { afterEach, expect, mock, test } from "bun:test"

const sent: Array<Record<string, unknown>> = []
let sesResult: { MessageId?: string } | Error = { MessageId: "ses-test-message" }
let destroyed = 0

mock.module("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    async send(command: { input: Record<string, unknown> }) {
      sent.push(command.input)
      if (sesResult instanceof Error) throw sesResult
      return sesResult
    }
    destroy() { destroyed += 1 }
  },
  SendEmailCommand: class {
    input: Record<string, unknown>
    constructor(input: Record<string, unknown>) {
      this.input = input
    }
  },
}))

const { EmailSendError, sendEmail, setConsoleEmailPreviewSink } = await import("./send-email.js")
const originalConsoleInfo = console.info

afterEach(() => {
  sent.length = 0
  sesResult = { MessageId: "ses-test-message" }
  destroyed = 0
  console.info = originalConsoleInfo
  setConsoleEmailPreviewSink(null)
})

test("uses console transport locally without AWS credentials", async () => {
  const lines: string[] = []
  const previews: Array<Record<string, unknown>> = []
  console.info = (...values: unknown[]) => lines.push(values.map(String).join(" "))
  setConsoleEmailPreviewSink((preview) => previews.push(preview))
  await sendEmail({
    to: "dev@example.com",
    template: "verification",
    props: { verificationCode: "123456" },
    config: { consoleMode: true },
  })
  expect(sent).toHaveLength(0)
  expect(lines[0]).toContain("[email] console delivery")
  expect(lines[0]).not.toContain("123456")
  expect(lines[0]).not.toContain("props")
  expect(previews[0]).toMatchObject({ template: "verification", props: { verificationCode: "123456" } })
})

test("sends existing templates only through AWS SES v2", async () => {
  const result = await sendEmail({
    to: "user@example.com",
    template: "verification",
    props: { verificationCode: "654321" },
    config: {
      from: "updates@matterhorn.so",
      fromName: "Matterhorn Desks",
      awsSes: {
        region: "us-east-1",
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "example-secret",
        configurationSetName: "matterhorn-transactional",
      },
    },
  })
  expect(result.messageId).toBe("ses-test-message")
  expect(sent[0].FromEmailAddress).toBe("Matterhorn Desks <updates@matterhorn.so>")
  expect(sent[0].ConfigurationSetName).toBe("matterhorn-transactional")
  expect(JSON.stringify(sent[0])).toContain("654321")
  expect(destroyed).toBe(1)
})

test("missing SES acknowledgement never counts as acceptance and releases the client", async () => {
  for (const messageId of [undefined, "", "   "]) {
    sesResult = { MessageId: messageId }
    await expect(sendEmail({
      to: "user@example.com", template: "verification", props: { verificationCode: "654321" },
      config: { from: "updates@example.com", awsSes: { region: "us-east-1", accessKeyId: "fixture", secretAccessKey: "fixture" } },
    })).rejects.toMatchObject({ name: "EmailSendError", reason: "ses_rejected" })
  }
  expect(destroyed).toBe(3)
})

test("SES failures release the client without exposing upstream error details", async () => {
  sesResult = new Error("sensitive provider response")
  await expect(sendEmail({
    to: "user@example.com", template: "verification", props: { verificationCode: "654321" },
    config: { from: "updates@example.com", awsSes: { region: "us-east-1", accessKeyId: "fixture", secretAccessKey: "fixture" } },
  })).rejects.toMatchObject({ message: "Email delivery failed: ses_rejected" })
  expect(destroyed).toBe(1)
})

test("fails closed without complete SES configuration and rejects header injection", async () => {
  for (const input of [
    { from: "updates@matterhorn.so", awsSes: { region: "us-east-1" } },
    {
      from: "updates@matterhorn.so\r\nBcc: attacker@example.com",
      awsSes: { region: "us-east-1", accessKeyId: "key", secretAccessKey: "secret" },
    },
  ]) {
    await expect(sendEmail({
      to: "user@example.com",
      template: "verification",
      props: { verificationCode: "654321" },
      config: input,
    })).rejects.toBeInstanceOf(EmailSendError)
  }
  expect(sent).toHaveLength(0)
})

test("rejects malformed and adversarially long email addresses without regex backtracking", async () => {
  for (const to of [
    "missing-domain@example",
    "double..dot@example.com",
    "user@-invalid.example",
    `${"!.".repeat(20_000)}@example.com`,
  ]) {
    await expect(sendEmail({
      to,
      template: "verification",
      props: { verificationCode: "654321" },
      config: { consoleMode: true },
    })).rejects.toBeInstanceOf(EmailSendError)
  }
  await expect(sendEmail({
    to: "user@example.com",
    template: "verification",
    props: { verificationCode: "654321" },
    config: {
      from: `${"!.".repeat(20_000)}@example.com`,
      awsSes: { region: "us-east-1", accessKeyId: "key", secretAccessKey: "secret" },
    },
  })).rejects.toBeInstanceOf(EmailSendError)
  expect(sent).toHaveLength(0)
})
