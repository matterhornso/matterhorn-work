import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components"

export type PasswordResetEmailProps = {
  resetLink: string
}

export function PasswordResetEmail({ resetLink }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Matterhorn Desks password</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>Matterhorn Desks</Text>
          <Heading style={styles.heading}>Reset your password</Heading>
          <Text style={styles.text}>Use this secure link to choose a new password for your Matterhorn Desks account.</Text>
          <Button href={resetLink} style={styles.button}>Reset password</Button>
          <Text style={styles.footer}>This link expires in 1 hour. If you did not request a password reset, you can ignore this email.</Text>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>If the button does not work, paste this link into your browser:</Text>
          <Text style={styles.link}>{resetLink}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body: {
    backgroundColor: "#05070b",
    color: "#fafcff",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    margin: 0,
  },
  container: {
    backgroundColor: "#0b0f14",
    border: "1px solid rgba(209, 242, 255, 0.24)",
    borderRadius: "10px",
    margin: "40px auto",
    maxWidth: "560px",
    padding: "32px",
  },
  brand: {
    color: "#d1f2ff",
    fontSize: "14px",
    fontWeight: 650,
    margin: "0 0 28px",
  },
  heading: {
    color: "#fafcff",
    fontSize: "26px",
    lineHeight: "32px",
    margin: "0 0 16px",
  },
  text: {
    color: "#c5d0dc",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0 0 24px",
  },
  button: {
    backgroundColor: "#d1f2ff",
    borderRadius: "8px",
    color: "#0c0c0c",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 700,
    marginBottom: "24px",
    padding: "13px 22px",
    textDecoration: "none",
  },
  hr: {
    borderColor: "rgba(209, 242, 255, 0.24)",
    margin: "28px 0 18px",
  },
  footer: {
    color: "#9caaba",
    fontSize: "14px",
    lineHeight: "21px",
    margin: "0 0 8px",
  },
  link: {
    color: "#d1f2ff",
    fontSize: "13px",
    lineHeight: "19px",
    margin: 0,
    wordBreak: "break-all" as const,
  },
}
