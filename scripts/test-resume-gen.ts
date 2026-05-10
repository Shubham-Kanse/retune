import fs from "node:fs";

async function run() {
  const profileText = fs.readFileSync("test-data/profile.md", "utf-8");
  const jdUrl = fs.readFileSync("test-data/jd.md", "utf-8").trim();

  console.log(`Fetching JD from ${jdUrl}...`);
  // Since I already fetched it in the thought process, I'll just use a placeholder or
  // better, I'll use a tool to fetch it if I were running this as a script.
  // But since I'm the agent, I'll just put the text here or fetch it again in the script if I can.
  // Actually, I'll just use the text I got from web_fetch.

  const jdText = `
### **Role Overview**
*   **Title:** Software Engineer
*   **Location:** Galway, Ireland (Hybrid: 3 days in-office per week)
*   **Team:** Cisco Collaboration
*   **Job ID:** 2013007

### **Key Responsibilities**
*   **Developer Experience:** Assist in defining the "Agentic Developer Experience" and contribute to internal developer platforms and tooling.
*   **Security:** Help define the security posture for the Collaboration organization.
*   **Collaboration:** Engage with engineering teams to understand developer needs and improve workflows.
*   **CI/CD:** Participate in CI/CD pipelines using the GitHub ecosystem (e.g., Agentic Workflows).

### **Qualifications**
*   **Minimum:**
    *   3+ years of experience in software engineering.
    *   Familiarity with modern development practices (Git, collaborative workflows).
*   **Preferred:**
    *   Proficiency in **JavaScript** and/or **TypeScript**.
    *   Experience with **CI/CD** tools (GitHub Actions) and **Developer Portals** (e.g., Backstage).
    *   Familiarity with **Cloud Platforms** (Kubernetes, AWS, Azure, GCP) and **Infrastructure as Code** (Terraform, Ansible).
    *   Experience with **DevEx** initiatives or platform engineering.
  `;

  const payload = {
    jd_title: "Software Engineer",
    company: "Cisco",
    jd_text: jdText,
    profile_text: profileText,
  };

  console.log("Starting generation...");
  const response = await fetch("http://localhost:4000/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error("Failed to start generation:", await response.text());
    return;
  }

  const data = await response.json();
  const generationId = data.generation_id;
  console.log(`Generation started! ID: ${generationId}`);
  console.log(`Runtime: ${data.runtime}`);

  if (data.stream) {
    console.log(`Streaming traces from ${data.stream}...`);
    const streamRes = await fetch(`http://localhost:4000${data.stream}`);
    const reader = streamRes.body?.getReader();
    if (!reader) {
      console.error("Failed to get stream reader");
      return;
    }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.kind === "trace") {
              console.log(`[Trace] ${event.step}: ${event.message}`);
            } else if (event.kind === "done") {
              console.log("Generation complete!");
              break;
            } else if (event.kind === "error") {
              console.error(`[Error] ${event.message}`);
            }
          } catch (e) {
            // Ignore malformed JSON
          }
        }
      }
    }
  } else {
    console.log("No stream available. Polling status...");
    let status = "running";
    while (status === "running") {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`http://localhost:4000/generate/${generationId}`);
      const statusData = await statusRes.json();
      if (statusData.resume) {
        console.log("Generation complete!");
        status = "complete";
      } else {
        console.log("Still running...");
      }
    }
  }

  const finalRes = await fetch(`http://localhost:4000/generate/${generationId}`);
  const finalData = await finalRes.json();
  console.log("\n--- GENERATED RESUME ---\n");
  console.log(finalData.resume);
  console.log("\n--- END ---\n");
}

run().catch(console.error);
