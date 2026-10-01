/** @jsxImportSource react */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function JevChatControl(props: {
  enabled: boolean; available: boolean; loading: boolean; privateMode: boolean;
  notice: string; onChange: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const explanation = props.privateMode ? "Jev is skipped in Private mode."
    : props.loading ? "Checking Jev availability…"
    : !props.available ? "Jev needs operator setup. Regular chat still works." : "Your selected model still answers.";
  return <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
    <Dialog open={open} onOpenChange={setOpen}>
      {props.enabled ? <Button ref={trigger} variant="outline" size="sm" aria-pressed={true} onClick={() => props.onChange(false)}>Jev: On</Button>
        : <DialogTrigger render={<Button ref={trigger} variant="outline" size="sm" aria-pressed={false}
          disabled={props.loading || !props.available || props.privateMode} />}>Jev: Off</DialogTrigger>}
      <DialogContent finalFocus={trigger} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Use Jev for message classification?</DialogTitle>
          <DialogDescription>TypeSafe will receive the text of each eligible message you send to classify its topic and task. Your selected model will still answer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-dls-text">
          <p>Files, saved memories and conversation history are not sent to Jev. Private mode and messages with sensitive context are skipped. Do not include secrets.</p>
          <p>Your choice is remembered for this account and workspace in this browser. Turn Jev off here at any time; this cannot undo messages already shared.</p>
          <a className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2" href="https://docs.typesafe.ai/legal" target="_blank" rel="noreferrer">TypeSafe data policies</a>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!props.available || props.privateMode} onClick={() => { props.onChange(true); setOpen(false); }}>Enable Jev</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <p role="status" className="min-w-0 flex-1 basis-44 text-xs leading-5 text-dls-secondary">{props.notice || explanation}</p>
  </div>;
}
