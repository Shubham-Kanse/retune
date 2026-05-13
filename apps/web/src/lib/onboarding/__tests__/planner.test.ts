import { describe, it, expect } from "vitest";
import { planNextQuestion } from "../planner";
import { createEmptyProfile, createEmptyMeta } from "../session-store";

describe("planNextQuestion", () => {
  it("empty profile + fresh meta → returns resume_upload phase", () => {
    const profile = createEmptyProfile("u1");
    const meta = createEmptyMeta();
    const q = planNextQuestion(profile, meta);
    expect(q).not.toBeNull();
    expect(q!.phase).toBe("resume_upload");
  });

  it("resume uploaded + parsed + not summarized → returns resume_summary phase", () => {
    const profile = createEmptyProfile("u1");
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = false;
    const q = planNextQuestion(profile, meta);
    expect(q).not.toBeNull();
    expect(q!.phase).toBe("resume_summary");
  });

  it("resume summarized + identity not confirmed + has identity data → returns identity_confirm", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane Doe";
    profile.identity.email.value = "jane@example.com";
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = false;
    const q = planNextQuestion(profile, meta);
    expect(q).not.toBeNull();
    expect(q!.phase).toBe("identity_confirm");
  });

  it("identity confirmed + experience exists + not confirmed → returns experience_confirm", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane Doe";
    profile.experience.value = [
      { id: "e1", title: "SWE", company: "Acme", responsibilities: [], achievements: [], tools: [], skills: [] },
    ];
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = false;
    const q = planNextQuestion(profile, meta);
    expect(q).not.toBeNull();
    expect(q!.phase).toBe("experience_confirm");
  });

  it("all confirmations done + professionalIdentities not confirmed → returns professional_identity", () => {
    const profile = createEmptyProfile("u1");
    profile.skills.technical.value = ["TypeScript"];
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = true;
    meta.educationConfirmed = true;
    meta.skillsConfirmed = true;
    profile.professionalProfile.professionalIdentities.confirmed = false;
    const q = planNextQuestion(profile, meta);
    expect(q).not.toBeNull();
    expect(q!.phase).toBe("professional_identity");
  });

  it("all career intent confirmed → returns null (profile ready)", () => {
    const profile = createEmptyProfile("u1");
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = true;
    meta.educationConfirmed = true;
    meta.skillsConfirmed = true;
    profile.professionalProfile.professionalIdentities.confirmed = true;
    profile.careerIntent.careerDirection.confirmed = true;
    profile.careerIntent.interestedRoles.confirmed = true;
    profile.careerIntent.preferredMarkets.confirmed = true;
    profile.careerIntent.workPreference.confirmed = true;
    profile.resumeWritingPreferences.emphasisAreas.confirmed = true;
    const q = planNextQuestion(profile, meta);
    expect(q).toBeNull();
  });

  it("planner returns pills array (non-empty)", () => {
    const profile = createEmptyProfile("u1");
    const meta = createEmptyMeta();
    const q = planNextQuestion(profile, meta);
    expect(q!.pills.length).toBeGreaterThan(0);
  });

  it("planner returns cards for experience_confirm phase", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane";
    profile.experience.value = [
      { id: "e1", title: "Engineer", company: "Corp", responsibilities: [], achievements: [], tools: ["Go"], skills: [] },
    ];
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    const q = planNextQuestion(profile, meta);
    expect(q!.phase).toBe("experience_confirm");
    expect(q!.cards).toBeDefined();
    expect(q!.cards!.length).toBeGreaterThan(0);
    expect(q!.cards![0].type).toBe("experience");
  });
});
