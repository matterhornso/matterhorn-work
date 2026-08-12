/** @jsxImportSource react */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, LogOut, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DenClient, DenUser } from "../../../../app/lib/den";
import {
  SettingsInset,
  SettingsNotice,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSectionHeaderContent,
  SettingsSectionHeaderDescription,
  SettingsSectionHeaderTitle,
} from "../settings-section";

type AccountSecuritySectionProps = {
  client: DenClient;
  user: DenUser;
  onSessionEnded: (message?: string | null) => void;
};

function mutationMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function downloadAccountRecord(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function AccountSecuritySection({
  client,
  user,
  onSessionEnded,
}: AccountSecuritySectionProps) {
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [deletePassword, setDeletePassword] = React.useState("");
  const [confirmationEmail, setConfirmationEmail] = React.useState("");

  const securityQuery = useQuery({
    queryKey: ["account-security"],
    queryFn: () => client.getAccountSecurity(),
    staleTime: 15_000,
  });
  const revokeMutation = useMutation({
    mutationFn: () => client.revokeOtherSessions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account-security"] });
    },
  });
  const exportMutation = useMutation({
    mutationFn: () => client.exportAccount(),
    onSuccess: (accountExport) => {
      downloadAccountRecord(accountExport.filename, accountExport);
    },
  });
  const passwordMutation = useMutation({
    mutationFn: () => client.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      onSessionEnded("Password changed. Sign in again on this device.");
      window.location.assign("/");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => client.deleteAccount(deletePassword, confirmationEmail),
    onSuccess: (result) => {
      const message = result.workspaceDataDeletionComplete
        ? "Account and owned workspace data deleted."
        : "Account deleted, but some workspace data still needs operator cleanup.";
      onSessionEnded(message);
      window.location.assign("/");
    },
  });

  const sessions = securityQuery.data?.sessionCount ?? 1;
  const otherSessions = Math.max(0, sessions - 1);
  const deletionBlockers = securityQuery.data?.sharedOrganizationsBlockingDeletion ?? [];
  const passwordReady =
    currentPassword.length > 0 &&
    newPassword.length >= 12 &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;
  const deletionReady =
    deletePassword.length > 0 && confirmationEmail.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <SettingsSection>
      <SettingsSectionHeader>
        <SettingsSectionHeaderContent>
          <SettingsSectionHeaderTitle>Account security</SettingsSectionHeaderTitle>
          <SettingsSectionHeaderDescription>
            Manage your password, signed-in devices, and account data.
          </SettingsSectionHeaderDescription>
        </SettingsSectionHeaderContent>
      </SettingsSectionHeader>

      {securityQuery.isError ? (
        <SettingsNotice tone="error">
          {mutationMessage(securityQuery.error, "Account security status is unavailable.")}
        </SettingsNotice>
      ) : null}

      <SettingsInset className="flex flex-col gap-4 rounded-lg p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-dls-text">
              <LogOut className="size-4 text-dls-secondary" aria-hidden="true" />
              Signed-in devices
            </p>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">
              {securityQuery.isLoading
                ? "Checking active sessions…"
                : otherSessions > 0
                  ? `${otherSessions} other ${otherSessions === 1 ? "session" : "sessions"} can access this account.`
                  : "Only this session is active."}
            </p>
          </div>
          <Button
            variant="outline"
            className="min-h-11 self-start sm:min-h-9"
            disabled={securityQuery.isLoading || otherSessions === 0 || revokeMutation.isPending}
            onClick={() => revokeMutation.mutate()}
          >
            {revokeMutation.isPending ? "Signing out…" : "Sign out other devices"}
          </Button>
        </div>
        {revokeMutation.isSuccess ? (
          <SettingsNotice>Other sessions have been signed out.</SettingsNotice>
        ) : null}
        {revokeMutation.isError ? (
          <SettingsNotice tone="error">
            {mutationMessage(revokeMutation.error, "Other sessions could not be signed out.")}
          </SettingsNotice>
        ) : null}
      </SettingsInset>

      <SettingsInset className="flex flex-col gap-4 rounded-lg p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-dls-text">
              <Download className="size-4 text-dls-secondary" aria-hidden="true" />
              Account record
            </p>
            <p className="mt-1 max-w-[68ch] text-xs leading-5 text-dls-secondary">
              Download your profile, legal acceptance, workspace memberships, and active-session count.
              Workspace chats and files are exported separately.
            </p>
          </div>
          <Button
            variant="outline"
            className="min-h-11 self-start sm:min-h-9"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            {exportMutation.isPending ? "Preparing download…" : "Download account record"}
          </Button>
        </div>
        {exportMutation.isSuccess ? <SettingsNotice>Account record downloaded.</SettingsNotice> : null}
        {exportMutation.isError ? (
          <SettingsNotice tone="error">
            {mutationMessage(exportMutation.error, "Account record could not be downloaded.")}
          </SettingsNotice>
        ) : null}
      </SettingsInset>

      <Collapsible open={passwordOpen} onOpenChange={setPasswordOpen}>
        <CollapsibleTrigger
          render={<Button variant="outline" className="min-h-11 w-full justify-start sm:min-h-9" />}
        >
          <KeyRound className="size-4" aria-hidden="true" />
          Change password
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <SettingsInset className="flex flex-col gap-4 rounded-lg p-4">
            <Field>
              <FieldLabel htmlFor="account-current-password">Current password</FieldLabel>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.currentTarget.value)}
              />
            </Field>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="account-new-password">New password</FieldLabel>
                <Input
                  id="account-new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.currentTarget.value)}
                />
                <FieldDescription>Use at least 12 characters.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="account-confirm-password">Confirm new password</FieldLabel>
                <Input
                  id="account-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  aria-invalid={Boolean(confirmPassword && confirmPassword !== newPassword)}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                />
              </Field>
            </div>
            {passwordMutation.isError ? (
              <SettingsNotice tone="error">
                {mutationMessage(passwordMutation.error, "Password could not be changed.")}
              </SettingsNotice>
            ) : null}
            <Button
              className="min-h-11 self-start sm:min-h-9"
              disabled={!passwordReady || passwordMutation.isPending}
              onClick={() => passwordMutation.mutate()}
            >
              {passwordMutation.isPending ? "Changing password…" : "Change password and sign out"}
            </Button>
          </SettingsInset>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={deleteOpen} onOpenChange={setDeleteOpen}>
        <CollapsibleTrigger
          render={<Button variant="destructive" className="min-h-11 w-full justify-start sm:min-h-9" />}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete account
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <SettingsInset className="flex flex-col gap-4 rounded-lg border border-destructive/25 p-4">
            <div>
              <p className="text-sm font-medium text-dls-text">Permanently delete this account</p>
              <p className="mt-1 max-w-[68ch] text-xs leading-5 text-dls-secondary">
                This removes your account, sessions, memberships, and workspaces you own alone. This cannot be undone.
              </p>
            </div>
            {deletionBlockers.length > 0 ? (
              <SettingsNotice tone="error">
                Transfer ownership or remove other members before deleting: {deletionBlockers.map((org) => org.name).join(", ")}.
              </SettingsNotice>
            ) : null}
            <Field>
              <FieldLabel htmlFor="account-delete-email">Type {user.email} to confirm</FieldLabel>
              <Input
                id="account-delete-email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={confirmationEmail}
                onChange={(event) => setConfirmationEmail(event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-delete-password">Password</FieldLabel>
              <Input
                id="account-delete-password"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.currentTarget.value)}
              />
            </Field>
            {deleteMutation.isError ? (
              <SettingsNotice tone="error">
                {mutationMessage(deleteMutation.error, "Account could not be deleted.")}
              </SettingsNotice>
            ) : null}
            <Button
              variant="destructive"
              className="min-h-11 self-start sm:min-h-9"
              disabled={!deletionReady || deletionBlockers.length > 0 || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting account…" : "Permanently delete account"}
            </Button>
          </SettingsInset>
        </CollapsibleContent>
      </Collapsible>
    </SettingsSection>
  );
}
