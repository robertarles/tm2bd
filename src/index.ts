#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import {
  parseTasksJson,
  validateDependencyIds,
  validateCircularDependencies,
} from './schemas/taskmaster.js';
import { topologicalSort } from './utils/topological-sort.js';
import { BeadsCli } from './beads/cli.js';
import { IdMapper } from './mapping/id-mapper.js';
import { createEpics } from './sync/epic-creator.js';
import { createAllChildren } from './sync/child-creator.js';
import { wireAllDependencies } from './sync/dependency-wirer.js';
import { syncAllStatuses } from './sync/status-syncer.js';

const program = new Command();

program
  .name('tm2bd')
  .description('Sync task-master-ai tasks to Beads issue tracker')
  .version('1.0.0');

program
  .command('sync')
  .description('Sync task-master tasks to Beads')
  .option('--tasks <path>', 'Path to tasks.json', '.taskmaster/tasks/tasks.json')
  .option('--project <path>', 'Path to project root with .beads/', '.')
  .option('--dry-run', 'Print commands without executing')
  .option('--force', 'Overwrite existing import (skip idempotency check)')
  .option('--resume', 'Resume from partial mapping file')
  .option('--map-file <path>', 'Path for ID mapping output', './tm2bd-map.json')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      console.log(chalk.bold('tm2bd: Task-Master to Beads Sync\n'));

      // Check Beads init
      const cli = new BeadsCli(options.project, options.verbose);
      const isInit = await cli.checkInit();
      if (!isInit) {
        console.error(chalk.red('Error: Beads not initialized. Run `bd init` first.'));
        process.exit(1);
      }

      // Idempotency check
      const mapExists = await IdMapper.exists(options.mapFile);
      if (mapExists && !options.force && !options.resume) {
        console.error(
          chalk.red(`Error: Mapping file ${options.mapFile} already exists.`),
          '\nUse --force to overwrite or --resume to continue from it.',
        );
        process.exit(1);
      }

      // Load or create mapper
      let mapper: IdMapper;
      if (options.resume && mapExists) {
        console.log(chalk.yellow('Resuming from existing mapping file...'));
        mapper = await IdMapper.load(options.mapFile);
      } else {
        mapper = new IdMapper();
      }

      // Parse and validate
      console.log(chalk.blue('Parsing tasks.json...'));
      const project = await parseTasksJson(options.tasks);
      console.log(chalk.green(`  Loaded ${project.tasks.length} tasks`));

      // Validate dependencies
      const depIdResult = validateDependencyIds(project.tasks);
      if (!depIdResult.valid) {
        console.error(chalk.red('Dependency validation failed:'));
        depIdResult.errors.forEach((e) => console.error(chalk.red(`  ${e}`)));
        process.exit(1);
      }

      const circResult = validateCircularDependencies(project.tasks);
      if (!circResult.valid) {
        console.error(chalk.red('Circular dependency detected:'));
        circResult.errors.forEach((e) => console.error(chalk.red(`  ${e}`)));
        process.exit(1);
      }

      // Topological sort
      console.log(chalk.blue('Sorting by dependencies...'));
      const sorted = topologicalSort(project.tasks);
      const sortedTasks = sorted.map((s) => s.task);
      const maxTier = sorted.length > 0 ? Math.max(...sorted.map((s) => s.tier)) + 1 : 0;
      console.log(chalk.green(`  Sorted into ${maxTier} dependency tier(s)`));

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.yellow('\n[DRY RUN] Commands that would be executed:\n'));
        for (const { task, tier } of sorted) {
          console.log(chalk.gray(`  [tier ${tier}] bd create "${task.title}" -t epic -p ${task.priority === 'high' ? 0 : task.priority === 'medium' ? 1 : 2}`));
          if (task.subtasks) {
            for (const sub of task.subtasks) {
              console.log(chalk.gray(`    bd create "${sub.title}" --parent <epic-id>`));
            }
          }
        }
        for (const task of project.tasks) {
          for (const depId of task.dependencies) {
            console.log(chalk.gray(`  bd dep add <epic-${task.id}> <epic-${depId}>`));
          }
        }
        console.log(chalk.yellow('\nNo changes made.'));
        process.exit(0);
      }

      // Create epics
      console.log(chalk.blue('Creating epics...'));
      await createEpics(sortedTasks, cli, mapper, (cur, tot) => {
        process.stdout.write(chalk.gray(`  ${cur}/${tot} epics\r`));
      });
      console.log(chalk.green(`  ${sortedTasks.length} epics created`));

      // Create children
      const totalSubtasks = project.tasks.reduce((s, t) => s + (t.subtasks?.length ?? 0), 0);
      if (totalSubtasks > 0) {
        console.log(chalk.blue('Creating child tasks...'));
        await createAllChildren(sortedTasks, cli, mapper, (cur, tot) => {
          process.stdout.write(chalk.gray(`  ${cur}/${tot} children\r`));
        });
        console.log(chalk.green(`  ${totalSubtasks} children created`));
      }

      // Wire dependencies
      console.log(chalk.blue('Wiring dependencies...'));
      const depCounts = await wireAllDependencies(project.tasks, cli, mapper);
      console.log(chalk.green(`  ${depCounts.epicDeps} epic deps, ${depCounts.subtaskDeps} subtask deps`));

      // Sync statuses
      console.log(chalk.blue('Synchronizing statuses...'));
      await syncAllStatuses(project.tasks, cli, mapper);
      console.log(chalk.green('  Statuses synchronized'));

      // Save mapping
      await mapper.save(options.mapFile);
      console.log(chalk.green(`  Mapping saved to ${options.mapFile}`));

      // Summary
      const stats = mapper.getStats();
      console.log(chalk.bold.green('\nSync complete!'));
      console.log(`  Epics: ${stats.epicCount}`);
      console.log(`  Children: ${stats.childCount}`);
      console.log(`  Dependencies: ${depCounts.epicDeps + depCounts.subtaskDeps}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
