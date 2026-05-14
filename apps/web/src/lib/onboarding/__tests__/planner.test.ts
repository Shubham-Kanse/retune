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
    profile.professionalProfile.currentTitles.value = ["Sr. Associate, Software Development Engineering"];
    profile.skills.technical.value = ["Java", "Spring Boot", "REST API", "CI/CD"];
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
    expect(q!.answerType).toBe("single_select");
    expect(q!.pills.map((p) => p.label)).toEqual(
      expect.arrayContaining(["Software Engineer", "Backend Developer", "API Engineer"]),
    );
  });

  it("experience and identity confirmed + education exists + not confirmed → returns education_confirm", () => {
    const profile = createEmptyProfile("u1");
    profile.education.value = [{ id: "ed1", degree: "MSc", institution: "UCD" }];
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = true;
    const q = planNextQuestion(profile, meta);
    expect(q!.phase).toBe("education_confirm");
  });

  it("basics confirmed + skills extracted but unconfirmed → returns skills_confirm", () => {
    const profile = createEmptyProfile("u1");
    profile.skills.technical.value = ["SQL", "Power BI", "Excel", "Tableau", "Analytics"];
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = true;
    meta.educationConfirmed = true;
    const q = planNextQuestion(profile, meta);
    expect(q!.phase).toBe("skills_confirm");
    expect(q!.cards?.map((card) => card.title)).toContain("Tier 1 skills");
  });

  it("basics confirmed + no extracted skills → asks user to add skills with pills", () => {
    const profile = createEmptyProfile("u1");
    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = true;
    meta.educationConfirmed = true;
    const q = planNextQuestion(profile, meta);
    expect(q!.phase).toBe("profile_gap_fill");
    expect(q!.field).toBe("skills");
    expect(q!.pills.map((p) => p.label)).toContain("Add skills");
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
    profile.professionalProfile.professionalIdentities.value = ["Software Engineer"];
    profile.careerIntent.careerDirection.confirmed = true;
    profile.careerIntent.careerDirection.value = "same";
    profile.careerIntent.interestedRoles.confirmed = true;
    profile.careerIntent.interestedRoles.value = ["Software Engineer"];
    profile.careerIntent.preferredMarkets.confirmed = true;
    profile.careerIntent.preferredMarkets.value = ["UK"];
    profile.careerIntent.workPreference.confirmed = true;
    profile.careerIntent.workPreference.value = "hybrid";
    profile.resumeWritingPreferences.emphasisAreas.confirmed = true;
    profile.resumeWritingPreferences.emphasisAreas.value = ["Backend engineering"];
    const q = planNextQuestion(profile, meta);
    expect(q).toBeNull();
  });

  it("AI education + SWE experience → asks a cross-domain career direction question", () => {
    const profile = createEmptyProfile("u1");
    profile.experience.value = [
      {
        id: "e1",
        title: "Sr. Associate, Software Development Engineering",
        company: "Fiserv",
        responsibilities: ["Built cloud-native microservices and REST APIs"],
        achievements: [],
        tools: ["Java", "Spring Boot"],
        skills: ["API Engineering"],
      },
    ];
    profile.education.value = [
      { id: "ed1", degree: "MSc in Computer Science", institution: "University of Galway", fieldOfStudy: "Artificial Intelligence" },
    ];

    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = true;
    meta.educationConfirmed = true;
    meta.skillsConfirmed = true;
    profile.professionalProfile.professionalIdentities.confirmed = true;
    profile.professionalProfile.professionalIdentities.value = ["Software Engineer"];

    const q = planNextQuestion(profile, meta);
    expect(q!.phase).toBe("career_direction");
    expect(q!.pills.map((p) => p.label)).toEqual(
      expect.arrayContaining(["Target AI/ML roles", "Hybrid AI + SWE roles", "Stay in SWE"]),
    );
  });

  it("multi-select role interests stay open until Continue", () => {
    const profile = createEmptyProfile("u1");
    profile.skills.technical.value = ["Java", "Spring Boot", "REST API"];
    profile.careerIntent.interestedRoles.value = ["Backend Developer"];

    const meta = createEmptyMeta();
    meta.resumeUploaded = true;
    meta.resumeParsed = true;
    meta.resumeSummarized = true;
    meta.identityConfirmed = true;
    meta.experienceConfirmed = true;
    meta.educationConfirmed = true;
    meta.skillsConfirmed = true;
    profile.professionalProfile.professionalIdentities.confirmed = true;
    profile.professionalProfile.professionalIdentities.value = ["Software Engineer"];
    profile.careerIntent.careerDirection.confirmed = true;
    profile.careerIntent.careerDirection.value = "same";

    const q = planNextQuestion(profile, meta);
    expect(q!.phase).toBe("role_interests");
    expect(q!.answerType).toBe("multi_select");
    expect(q!.pills).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Continue", action: "confirm_field" })]));
    expect(q!.pills).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Backend Developer", selected: true })]));
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
