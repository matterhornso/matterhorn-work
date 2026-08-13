import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components"

export type VerificationEmailProps = {
  verificationCode: string
}

export function VerificationEmail({ verificationCode }: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Matterhorn Desks verification code is {verificationCode}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>Matterhorn Desks</Text>
          <Heading style={styles.heading}>Verify your email</Heading>
          <Text style={styles.text}>Enter this code to finish signing in to Matterhorn Desks.</Text>
          <Section style={styles.codeBox}>
            <Text style={styles.code}>{verificationCode}</Text>
          </Section>
          <Text style={styles.footer}>This code expires in 10 minutes. If you did not request it, you can ignore this email.</Text>
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
    maxWidth: "520px",
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
  codeBox: {
    backgroundColor: "#151d26",
    borderRadius: "8px",
    margin: "0 0 24px",
    padding: "22px",
    textAlign: "center" as const,
  },
  code: {
    color: "#d1f2ff",
    fontSize: "34px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    lineHeight: "40px",
    margin: 0,
  },
  footer: {
    color: "#9caaba",
    fontSize: "14px",
    lineHeight: "21px",
    margin: 0,
  },
}
