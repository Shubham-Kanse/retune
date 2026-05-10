/**
 * Seed script — creates a test user with a complete profile and sample application.
 * Run: node --import tsx scripts/seed.ts
 */

import { randomUUID } from "node:crypto";
import { applications, db, profiles, subscriptions, users } from "@retune/db";
import bcrypt from "bcryptjs";

const now = new Date();
const userId = randomUUID();

// 1. Create user
db.insert(users)
  .values({
    id: userId,
    email: "test@retune.dev",
    passwordHash: bcrypt.hashSync("password123", 12),
    fullName: "Alex Morgan",
    authProvider: "email",
    emailVerified: true,
    onboardingCompleted: true,
    createdAt: now,
    updatedAt: now,
  })
  .run();

// 2. Create subscription (free plan)
db.insert(subscriptions)
  .values({
    id: randomUUID(),
    userId,
    plan: "free",
    status: "active",
    createdAt: now,
    updatedAt: now,
  })
  .run();

// 3. Create profile
db.insert(profiles)
  .values({
    id: randomUUID(),
    userId,
    fullName: "Alex Morgan",
    email: "test@retune.dev",
    phone: "+353 89 123 4567",
    linkedin: "https://www.linkedin.com/in/alexmorgan",
    location: "Dublin, Ireland",
    targetRoles: JSON.stringify(["Business Analyst", "Data Analyst", "SQL Developer"]),
    experienceLevel: "mid",
    currentTitle: "Database Developer",
    experience: JSON.stringify([
      {
        company: "Cognizant Technology Solutions",
        title: "Database Developer",
        startDate: "2021-12",
        endDate: "2024-07",
        description:
          "Wrote and optimised complex SQL queries, stored procedures, triggers across Oracle and SQL Server. Built 10+ Power BI dashboards for C-level reporting. Refined 40+ user stories in Jira. Led sprint planning across 12+ Agile cycles.",
        metrics: [
          {
            metric: "billing accuracy",
            value: "22%",
            context: "improved over 3 quarters",
            direction: "improved",
          },
          {
            metric: "data retrieval time",
            value: "30%",
            context: "via execution plan analysis and indexing",
            direction: "reduced",
          },
          {
            metric: "reporting delays",
            value: "35%",
            context: "through dashboard automation",
            direction: "reduced",
          },
          {
            metric: "incident resolution time",
            value: "35%",
            context: "through structured root cause analysis",
            direction: "reduced",
          },
        ],
        tools: [
          "SQL",
          "Oracle",
          "SQL Server",
          "Power BI",
          "Jira",
          "Confluence",
          "Postman",
          "Splunk",
        ],
        teamSize: 12,
        industry: "Telecom",
      },
    ]),
    education: JSON.stringify([
      {
        degree: "MSc Business Analytics",
        institution: "University of Galway",
        startDate: "2024-09",
        endDate: "2025-09",
        coursework: [
          "Data Science",
          "Machine Learning",
          "Statistical Analysis",
          "Business Intelligence",
        ],
        status: "completed",
      },
      {
        degree: "Master of Computer Applications",
        institution: "Government College of Engineering",
        startDate: "2019-11",
        endDate: "2021-07",
        status: "completed",
      },
    ]),
    certifications: JSON.stringify([
      "Oracle Cloud Data Management Foundations Certified Associate",
      "Business Analysis Professional (BAP)",
    ]),
    skillsTier1: JSON.stringify([
      {
        name: "SQL",
        evidence: "2.5+ years daily use, complex queries, stored procedures, performance tuning",
      },
      { name: "Power BI", evidence: "Built 10+ production dashboards for C-level reporting" },
      { name: "Jira", evidence: "Daily use for 2.5 years, user stories, sprint planning" },
      { name: "Agile/Scrum", evidence: "12+ sprint cycles, planning, grooming, retrospectives" },
      { name: "Requirements Gathering", evidence: "BRDs, FRDs, user stories, acceptance criteria" },
      {
        name: "Stakeholder Management",
        evidence: "Cross-functional coordination with product, engineering, QA",
      },
    ]),
    skillsTier2: JSON.stringify([
      { name: "Python", evidence: "Data manipulation, automation scripts, Pandas/NumPy" },
      { name: "Tableau", evidence: "Built dashboards, data visualisation" },
      { name: "Postman", evidence: "API testing and validation in production" },
      { name: "Shell Scripting", evidence: "Automation of recurring tasks" },
    ]),
    skillsTier3: JSON.stringify([
      { name: "R", evidence: "University coursework, basic statistical analysis" },
      { name: "Figma", evidence: "Basic wireframing" },
    ]),
    voiceNotes:
      "Direct and specific, leads with numbers, technically grounded, confident but not boastful",
    profileMarkdown:
      "# Alex Morgan — Candidate Profile\n\nBusiness Analyst / SQL Developer with 3+ years experience in telecom billing systems.",
    completenessScore: 85,
    createdAt: now,
    updatedAt: now,
  })
  .run();

// 4. Create a sample completed application
db.insert(applications)
  .values({
    id: randomUUID(),
    userId,
    companyName: "Stripe",
    roleTitle: "Business Analyst",
    jobDescription:
      "We are looking for a Business Analyst to join our Payments team in Dublin. You will work with product managers and engineers to define requirements, analyse data, and drive improvements to our billing platform. Requirements: 3+ years BA experience, SQL proficiency, Agile methodology, stakeholder management, Power BI or Tableau.",
    status: "completed",
    atsScore: 91,
    resumeContent:
      "# Alex Morgan\n## Business Analyst\n\nDublin, Ireland | test@retune.dev | +353 89 123 4567 | [LinkedIn](https://linkedin.com/in/alexmorgan)\n\n### PROFESSIONAL SUMMARY\n\nBusiness Analyst with 3+ years of experience in telecom billing and payment systems, delivering data-driven insights across cross-functional teams. Improved billing accuracy by 22% through SQL-based data profiling on 2M+ records. Proficient in SQL, Power BI, Jira, and Agile delivery across 12+ sprint cycles. MSc in Business Analytics from University of Galway.\n\n### SKILLS\n\n**Business Analysis:** Requirements gathering, user stories, process mapping, gap analysis, stakeholder management, BRD/FRS documentation\n**Data & Reporting:** SQL (Oracle, SQL Server), Power BI, Tableau, data validation, dashboard design, data profiling\n**Methodologies:** Agile, Scrum, sprint planning, UAT coordination, SDLC\n**Tools:** Jira, Confluence, Postman, Splunk, ServiceNow, MS Office Suite\n\n### WORK EXPERIENCE\n\n#### Business Analyst — Cognizant Technology Solutions\n*December 2021 – July 2024*\n\n- Conducted SQL-based data profiling on 2M+ telecom billing records, improving billing accuracy by 22% over 3 quarters\n- Built 10+ Power BI dashboards for C-level stakeholders, reducing reporting delays by 35% through automated KPI tracking\n- Refined 40+ user stories and epics in Jira, achieving >95% stakeholder approval on acceptance criteria\n- Led sprint planning, grooming, and retrospectives across 12+ Agile sprint cycles, improving delivery predictability by 25%\n- Optimised SQL queries using execution plan analysis and indexing, reducing data retrieval time by 30%\n- Coordinated UAT involving 50+ defects, accelerating release timelines by 20%\n\n### EDUCATION\n\n#### MSc Business Analytics — University of Galway\n*September 2024 – September 2025*\n\nRelevant coursework: Data Science, Machine Learning, Statistical Analysis, Business Intelligence\n\n#### Master of Computer Applications — Government College of Engineering\n*November 2019 – July 2021*\n\n### CERTIFICATIONS\n\n- Oracle Cloud Data Management Foundations Certified Associate\n- Business Analysis Professional (BAP)",
    coverLetterContent:
      "Dear Hiring Manager,\n\nStripe's mission to increase the GDP of the internet resonates deeply with my experience optimising telecom billing systems that process millions of transactions. Having improved billing accuracy by 22% through SQL-based data profiling at Cognizant, I understand the critical importance of payment data integrity at scale.\n\nIn my role as Business Analyst at Cognizant, I delivered measurable impact across three areas directly relevant to Stripe's Payments team:\n\n- Data-driven analysis: Profiled 2M+ billing records using SQL, identifying anomalies that improved accuracy by 22% over 3 quarters\n- Stakeholder delivery: Refined 40+ user stories with >95% approval rate, coordinating across product, engineering, and QA teams\n- Operational efficiency: Built 10+ Power BI dashboards that reduced C-level reporting delays by 35%\n\nMy MSc in Business Analytics from University of Galway has strengthened my analytical toolkit with machine learning and predictive analytics capabilities that complement my production SQL experience.\n\nI would welcome the opportunity to discuss how my experience in billing systems and data analysis can contribute to Stripe's payments platform.\n\nBest regards,\nAlex Morgan",
    applicationStrategy:
      "# Application Strategy — Stripe, Business Analyst\n\n## Timeline\n\n- **Today**: Apply via Stripe careers portal\n- **Day 2**: Like 2 recent Stripe posts on LinkedIn\n- **Day 3**: Message hiring manager on LinkedIn\n- **Day 7**: Follow up if no response\n\n## Referral Targets\n\nLinkedIn search: \"Stripe Dublin Business Analyst\"\n\n## Outreach Message\n\n```\nHi [Name], I recently applied for the Business Analyst role on Stripe's Payments team in Dublin. With 3+ years in telecom billing analysis and an MSc in Business Analytics, I'm excited about the opportunity to contribute to Stripe's mission. Would you be open to a brief chat about the team?\n```\n\n## Interview Prep\n\n### \"Tell me about a time you improved a business process\"\n\n**Situation:** At Cognizant, our telecom client's billing system had a 78% accuracy rate across 2M+ customer records.\n**Task:** I was tasked with identifying the root causes and improving accuracy.\n**Action:** I conducted SQL-based data profiling, built anomaly detection queries, and created Power BI dashboards to track accuracy metrics weekly.\n**Result:** Billing accuracy improved by 22% over 3 quarters, and the dashboards reduced reporting delays by 35%.",
    companyIntel:
      "Stripe — fintech, payments infrastructure, Dublin office, 8000+ employees, mission: increase GDP of internet.",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  })
  .run();

console.log("✅ Seed complete!");
console.log("");
console.log("Test user credentials:");
console.log("  Email:    test@retune.dev");
console.log("  Password: password123");
console.log("");
console.log("The user has:");
console.log("  - A complete profile (85% completeness)");
console.log("  - 1 completed application (Stripe, ATS: 91%)");
console.log("  - Free plan (2 generations, 0 used)");
