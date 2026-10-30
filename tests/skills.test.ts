import { afterAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findSkill, loadSkills, skillPrompt } from '../src/skills.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eschaton-skills-'))

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('skills', () => {
  test('loads project skills from .eschaton/skills', () => {
    const folder = path.join(dir, '.eschaton', 'skills', 'demo')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(
      path.join(folder, 'SKILL.md'),
      '---\nname: demo\ndescription: A demo skill\nalways: true\n---\n\nDo the thing.',
      'utf-8',
    )

    const skills = loadSkills(dir)
    const demo = findSkill(skills, 'demo')

    expect(demo).toBeDefined()
    expect(demo?.description).toBe('A demo skill')
    expect(demo?.always).toBe(true)

    const prompt = skillPrompt(skills)
    expect(prompt).toContain('Always-on skill: demo')
    expect(prompt).toContain('Do the thing.')
  })

  test('ships the bundled skills', () => {
    const skills = loadSkills(dir)
    const names = skills.map((skill) => skill.name)

    expect(names).toContain('using-superpowers')
    expect(names).toContain('test-driven-development')
    expect(names).toContain('ponytail')
    expect(names).toContain('caveman')
    expect(names).toContain('karpathy-guidelines')
    expect(names).toContain('graphify')
  })

  test('always-on skills are included in full, the rest are catalogued', () => {
    const skills = loadSkills(dir)
    const prompt = skillPrompt(skills)

    expect(prompt).toContain('karpathy-guidelines')
    expect(prompt).toContain('Ponytail')

    const catalog = prompt.split('### Always-on skill')[0] ?? ''
    expect(catalog).toContain('brainstorming')
  })
})
