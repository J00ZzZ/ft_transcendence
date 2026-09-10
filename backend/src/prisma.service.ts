import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { requireSecret } from './secrets';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
	db: InstanceType<typeof PrismaClient>;

	constructor() {
		// LOCAL/DOCKER: use PrismaPg adapter for direct Postgres access (Prisma 7 requirement)
		// VERCEL: comment out adapter line, comment out engineType in schema.prisma,
		//         and uncomment the accelerateUrl line below
		// DATABASE_URL comes straight from env now: compose's env_file gives
		// containers the .env value, overridden to the container form (host "db")
		// via the environment: entry in compose.yaml. See backend/prisma.config.ts.
		const connectionString = requireSecret('DATABASE_URL');
		const pool = new Pool({ connectionString, max: 5 }); //changes made 23/7 by bing
		const adapter = new PrismaPg(pool); //changes made 23/7 by bing
		this.db = new PrismaClient({
			adapter,
		});
		/*
		// VERCEL alternative:
		const accelerateUrl = process.env["ACCELERATE_URL"];
		if (accelerateUrl) {
			this.db = new PrismaClient({ accelerateUrl });
		}
		*/
	}

	async onModuleInit() {
		await this.db.$connect();
	}

	async onModuleDestroy() {
		await this.db.$disconnect();
	}
}