"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";

import { useWallet } from "@/providers/StellarWalletProvider";
import type { MentorMatch, Mentorship, MentorProfile, MentorshipMessage } from "@/services/mentorship.service";

type MentorshipWithMentor = Mentorship & { mentor: MentorProfile | null };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Request failed");
  return payload as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Request failed");
  return payload as T;
}

function Chat({ mentorshipId, address }: { mentorshipId: string; address: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const key = ["mentorship-messages", mentorshipId, address];
  const { data } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      getJson<{ messages: MentorshipMessage[] }>(
        `/api/mentorships/${encodeURIComponent(mentorshipId)}/messages?viewer=${encodeURIComponent(address)}`,
        signal,
      ),
    refetchInterval: 10_000,
  });
  const send = useMutation({
    mutationFn: () =>
      postJson(`/api/mentorships/${encodeURIComponent(mentorshipId)}/messages`, { senderAddress: address, text }),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 p-3">
      <ul aria-label="Mentorship messages" className="max-h-56 space-y-2 overflow-y-auto text-sm">
        {(data?.messages ?? []).map((m) => (
          <li key={m.id} className={m.senderAddress === address ? "text-right text-cyan-200" : "text-zinc-200"}>
            {m.text}
          </li>
        ))}
        {data?.messages.length === 0 && <li className="text-zinc-500">No messages yet. Say hello!</li>}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate();
        }}
      >
        <input
          aria-label="Message your mentor"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={send.isPending || !text.trim()}
          className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {send.isError && <p className="mt-2 text-xs text-red-400">{(send.error as Error).message}</p>}
    </div>
  );
}

export function MentorshipPanel() {
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [searched, setSearched] = useState("");
  const [openChat, setOpenChat] = useState<string | null>(null);

  const mentorships = useQuery({
    queryKey: ["mentorships", address],
    queryFn: ({ signal }) =>
      getJson<{ mentorships: MentorshipWithMentor[] }>(`/api/mentorships?address=${encodeURIComponent(address!)}`, signal),
    enabled: !!address,
  });
  const matches = useQuery({
    queryKey: ["mentor-matches", searched],
    queryFn: ({ signal }) =>
      getJson<{ matches: MentorMatch[] }>(`/api/mentors?category=${encodeURIComponent(searched)}`, signal),
    enabled: !!searched,
  });
  const request = useMutation({
    mutationFn: (mentorAddress: string) =>
      postJson("/api/mentorships", { creatorAddress: address, mentorAddress, category: searched }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mentorships", address] });
      void queryClient.invalidateQueries({ queryKey: ["mentor-matches", searched] });
    },
  });

  const existing = mentorships.data?.mentorships ?? [];

  return (
    <section aria-labelledby="mentorship-heading" className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 id="mentorship-heading" className="flex items-center gap-2 text-lg font-semibold text-white">
        <MessageCircle className="h-5 w-5 text-cyan-400" aria-hidden="true" />
        Creator Mentorship
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        Get guidance on strategy, marketing and fulfilment from experienced, verified creators.
      </p>

      {!address && <p className="mt-4 text-sm text-zinc-500">Connect your wallet to find a mentor.</p>}

      {address && (
        <>
          {existing.map((m) => (
            <div key={m.id} className="mt-4">
              <button
                type="button"
                className="font-medium text-cyan-300"
                onClick={() => setOpenChat(openChat === m.id ? null : m.id)}
              >
                Chat with {m.mentor?.name ?? m.mentorAddress}
              </button>
              {openChat === m.id && <Chat mentorshipId={m.id} address={address} />}
            </div>
          ))}

          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearched(category.trim());
            }}
          >
            <input
              aria-label="Campaign category"
              placeholder="Campaign category, e.g. reforestation"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
            <button type="submit" className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white">
              Find mentors
            </button>
          </form>

          {matches.data && matches.data.matches.length === 0 && (
            <p className="mt-3 text-sm text-zinc-500">No mentors are available right now.</p>
          )}
          <ul className="mt-3 space-y-2">
            {matches.data?.matches.map(({ mentor, categoryMatch }) => (
              <li key={mentor.address} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3">
                <div className="text-sm">
                  <p className="font-semibold text-white">
                    {mentor.name} {categoryMatch && <span className="text-xs text-cyan-300">· category match</span>}
                  </p>
                  <p className="text-xs text-zinc-400">{mentor.expertiseTags.join(", ")}</p>
                  <p className="text-xs text-zinc-500">
                    Available {mentor.availability.days.length ? `${mentor.availability.days.length} days/week` : "by arrangement"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={request.isPending || existing.some((m) => m.mentorAddress === mentor.address)}
                  onClick={() => request.mutate(mentor.address)}
                  className="rounded-lg border border-cyan-500 px-3 py-1 text-xs text-cyan-300 disabled:opacity-50"
                >
                  Request mentorship
                </button>
              </li>
            ))}
          </ul>
          {request.isError && <p className="mt-2 text-xs text-red-400">{(request.error as Error).message}</p>}
        </>
      )}
    </section>
  );
}

export default MentorshipPanel;
