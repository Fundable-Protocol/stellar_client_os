"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import {
  createSponsorTeam,
  inviteSponsorToTeam,
  listSponsorTeams,
  recordTeamTreeSponsorship,
  type SponsorTeam,
} from "@/services/social.service";

export function SponsorTeamDashboard() {
  const { address } = useWallet();
  const [teams, setTeams] = useState<SponsorTeam[]>(() => listSponsorTeams());
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [treeId, setTreeId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ownedTeams = useMemo(() => teams.filter((team) => team.owner === address), [teams, address]);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? ownedTeams[0];

  function refresh() {
    setTeams(listSponsorTeams());
  }

  function submitTeam(event: FormEvent) {
    event.preventDefault();
    try {
      if (!address) throw new Error("Connect your wallet to create a team");
      const team = createSponsorTeam(address, name);
      setName("");
      setSelectedTeamId(team.id);
      setError(null);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create team");
    }
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    try {
      if (!address || !selectedTeam) throw new Error("Create a team first");
      inviteSponsorToTeam(selectedTeam.id, address, invite);
      setInvite("");
      setError(null);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to invite sponsor");
    }
  }

  function submitTree(event: FormEvent) {
    event.preventDefault();
    try {
      if (!address || !selectedTeam) throw new Error("Create a team first");
      recordTeamTreeSponsorship(selectedTeam.id, address, treeId);
      setTreeId("");
      setError(null);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record sponsorship");
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6 rounded-2xl border border-white/10 bg-[#0F1621] p-6 text-white shadow-xl">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Team forest</p>
        <h1 className="mt-2 text-2xl font-bold">Sponsor trees together</h1>
        <p className="mt-2 text-sm text-slate-400">Invite friends, track every sponsored tree, and see your team’s combined impact.</p>
      </header>

      {!address && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">Connect a wallet to create or manage a sponsor team.</p>}
      {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}

      <form onSubmit={submitTeam} className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="team-name">Team name</label>
        <input id="team-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Team name" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
        <button type="submit" disabled={!address} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Create team</button>
      </form>

      {selectedTeam && (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">{selectedTeam.name}</h2>
              <p className="text-xs text-slate-400">{selectedTeam.members.length} members · {selectedTeam.sponsoredTrees.length} trees sponsored</p>
            </div>
            <div className="text-right"><p className="text-2xl font-bold text-emerald-300">{selectedTeam.totalImpact}</p><p className="text-xs text-slate-400">team impact points</p></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <form onSubmit={submitInvite} className="flex gap-2">
              <label className="sr-only" htmlFor="team-invite">Sponsor address</label>
              <input id="team-invite" value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="Sponsor address" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs" />
              <button type="submit" className="rounded-lg border border-white/10 px-3 py-2 text-xs">Invite</button>
            </form>
            <form onSubmit={submitTree} className="flex gap-2">
              <label className="sr-only" htmlFor="team-tree">Tree ID</label>
              <input id="team-tree" value={treeId} onChange={(event) => setTreeId(event.target.value)} placeholder="Sponsored tree ID" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs" />
              <button type="submit" className="rounded-lg border border-white/10 px-3 py-2 text-xs">Add tree</button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
