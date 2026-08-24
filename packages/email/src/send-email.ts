import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"
import { render } from "@react-email/render"
import { emailReplyTo, emailSubjects, type EmailTemplate, type EmailTemplateProps, renderEmailTemplate } from "./templates/index.js"

export type EmailProvider = "console" | "ses"

export type AwsSesEmailConfig = {
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  configurationSetName?: string
}

export type EmailSendConfig = {
  from?: string
  fromName?: string
  awsSes?: AwsSesEmailConfig
  consoleMode?: boolean
}

export class EmailSendError extends Error {
  readonly reason: "email_not_configured" | "ses_rejected"
  readonly template: EmailTemplate

  constructor(input: { template: EmailTemplate; reason: EmailSendError["reason"] }) {
    super(`Email delivery failed: ${input.reason}`)
    this.name = "EmailSendError"
    this.reason = input.reason
    this.template = input.template
  }
}

export type SendEmailInput<Template extends EmailTemplate = EmailTemplate> = {
  to: string
  template: Template
  props: EmailTemplateProps[Template]
  config: EmailSendConfig
  subject?: string
}

export type SendEmailResult = {
  provider: EmailProvider
  messageId?: string
}

export type ConsoleEmailPreview = {
  to: string
  template: EmailTemplate
  subject: string
  replyTo?: string
  props: Record<string, unknown>
}

let consoleEmailPreviewSink: ((preview: ConsoleEmailPreview) => void) | null = null

export function setConsoleEmailPreviewSink(
  sink: ((preview: ConsoleEmailPreview) => void) | null,
): void {
  consoleEmailPreviewSink = sink
}

function safeHeader(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  if (!normalized || /[\r\n]/.test(normalized)) return undefined
  return normalized
}

const EMAIL_LOCAL_SPECIALS = new Set("!#$%&'*+-/=?^_`{|}~.".split(""))

function asciiLetterOrDigit(character: string): boolean {
  const code = character.charCodeAt(0)
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
}

function validEmailAddress(value: string): boolean {
  if (value.length > 320) return false
  const separator = value.indexOf("@")
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false
  const local = value.slice(0, separator)
  const domain = value.slice(separator + 1)
  if (
    local.length > 64
    || domain.length === 0
    || domain.length > 255
    || local.startsWith(".")
    || local.endsWith(".")
    || local.includes("..")
  ) return false
  for (const character of local) {
    if (!asciiLetterOrDigit(character) && !EMAIL_LOCAL_SPECIALS.has(character)) return false
  }
  const labels = domain.split(".")
  if (labels.length < 2) return false
  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || label.startsWith("-") || label.endsWith("-")) return false
    for (const character of label) {
      if (!asciiLetterOrDigit(character) && character !== "-") return false
    }
  }
  return true
}

function sender(config: EmailSendConfig): string | undefined {
  const address = safeHeader(config.from)
  if (!address || !validEmailAddress(address)) return undefined
  const name = safeHeader(config.fromName)?.replaceAll(/[<>\"]/g, "")
  return name ? `${name} <${address}>` : address
}

export function getEmailProvider(config: EmailSendConfig): EmailProvider {
  return config.consoleMode ? "console" : "ses"
}

export function emailDeliveryConfigured(config: EmailSendConfig): boolean {
  if (config.consoleMode) return true
  return Boolean(
    sender(config) &&
      config.awsSes?.region?.trim() &&
      config.awsSes.accessKeyId?.trim() &&
      config.awsSes.secretAccessKey?.trim(),
  )
}

export async function sendEmail<Template extends EmailTemplate>(input: SendEmailInput<Template>): Promise<SendEmailResult> {
  const to = safeHeader(input.to)
  if (!to || !validEmailAddress(to)) {
    throw new EmailSendError({ template: input.template, reason: "email_not_configured" })
  }

  const subject = safeHeader(input.subject ?? emailSubjects[input.template](input.props))
  const replyTo = safeHeader(emailReplyTo[input.template](input.props))
  const provider = getEmailProvider(input.config)
  if (!subject || !emailDeliveryConfigured(input.config)) {
    throw new EmailSendError({ template: input.template, reason: "email_not_configured" })
  }

  if (provider === "console") {
    console.info(`[email] console delivery: ${JSON.stringify({ to, template: input.template })}`)
    consoleEmailPreviewSink?.({
      to,
      template: input.template,
      subject,
      ...(replyTo ? { replyTo } : {}),
      props: input.props,
    })
    return { provider }
  }

  const source = sender(input.config)
  const awsSes = input.config.awsSes
  if (!source || !awsSes?.region || !awsSes.accessKeyId || !awsSes.secretAccessKey) {
    throw new EmailSendError({ template: input.template, reason: "email_not_configured" })
  }

  const component = renderEmailTemplate(input.template, input.props)
  const [html, text] = await Promise.all([
    render(component),
    render(component, { plainText: true }),
  ])
  try {
    const client = new SESv2Client({
      region: awsSes.region,
      credentials: {
        accessKeyId: awsSes.accessKeyId,
        secretAccessKey: awsSes.secretAccessKey,
      },
    })
    const result = await client.send(new SendEmailCommand({
      FromEmailAddress: source,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      ConfigurationSetName: safeHeader(awsSes.configurationSetName),
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text, Charset: "UTF-8" },
          },
        },
      },
    }))
    return { provider, messageId: result.MessageId }
  } catch {
    throw new EmailSendError({ template: input.template, reason: "ses_rejected" })
  }
}
