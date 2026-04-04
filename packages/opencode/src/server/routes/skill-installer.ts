import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { lazy } from "@/util/lazy"
import * as Installer from "../../skill/installer"

function repo(input: string) {
  const text = input.trim()
  if (!text) return
  const hit = text.match(/github\.com\/([^/]+)\/([^/]+)/i)
  if (hit) {
    return { owner: hit[1], repo: hit[2].replace(/\.git$/i, "") }
  }
  const parts = text.replace(/^https?:\/\//i, "").split("/")
  if (parts.length >= 2 && !parts[0].includes(".")) {
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") }
  }
}

export const SkillInstallerRoutes = lazy(() =>
  new Hono()
    .get(
      "/search",
      describeRoute({
        summary: "Search for skills on GitHub",
        description: "Search GitHub repositories containing SKILL.md files.",
        operationId: "skill-installer.search",
        responses: {
          200: {
            description: "Search results",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    items: z.array(
                      z.object({
                        owner: z.string(),
                        repo: z.string(),
                        name: z.string(),
                        description: z.string(),
                        stars: z.number(),
                        url: z.string(),
                        skillsUrl: z.string(),
                        skills: z.array(
                          z.object({
                            name: z.string(),
                            description: z.string(),
                          }),
                        ),
                      }),
                    ),
                    totalCount: z.number(),
                    incompleteResults: z.boolean(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const query = c.req.query("q") ?? ""
        const page = parseInt(c.req.query("page") ?? "1")
        const result = await Installer.search(query, page)
        return c.json(result)
      },
    )
    .get(
      "/inspect",
      describeRoute({
        summary: "Inspect a skill repository",
        description: "Get detailed information about skills in a GitHub repository.",
        operationId: "skill-installer.inspect",
        responses: {
          200: {
            description: "Repository details with skills",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    owner: z.string(),
                    repo: z.string(),
                    name: z.string(),
                    description: z.string(),
                    stars: z.number(),
                    url: z.string(),
                    skillsUrl: z.string(),
                    skills: z.array(
                      z.object({
                        name: z.string(),
                        description: z.string(),
                      }),
                    ),
                  }).nullable(),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const owner = c.req.query("owner")
        const repo = c.req.query("repo")
        if (!owner || !repo) {
          return c.json(null)
        }
        const result = await Installer.inspect(owner, repo)
        return c.json(result)
      },
    )
    .post(
      "/install",
      describeRoute({
        summary: "Install skills from a repository",
        description: "Download and install skills from a GitHub repository.",
        operationId: "skill-installer.install",
        responses: {
          200: {
            description: "Installation result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    installed: z.array(z.string()),
                    url: z.string(),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const body = await c.req.json<{
          owner?: string
          repo?: string
          url?: string
          scope?: Installer.InstallScope
        }>()
        const pair =
          body.owner && body.repo ? { owner: body.owner, repo: body.repo } : body.url ? repo(body.url) : undefined
        if (!pair) {
          return c.json({ installed: [], url: "" })
        }
        const result = await Installer.install(pair.owner, pair.repo, { scope: body.scope })
        return c.json(result)
      },
    )
    .get(
      "/installed",
      describeRoute({
        summary: "List installed skill repositories",
        description: "Get a list of skill repositories that have been installed.",
        operationId: "skill-installer.installed",
        responses: {
          200: {
            description: "List of installed repos",
            content: {
              "application/json": {
                schema: resolver(z.array(z.string())),
              },
            },
          },
        },
      }),
      async (c) => {
        const result = await Installer.installedRepos()
        return c.json(result)
      },
    ),
)
