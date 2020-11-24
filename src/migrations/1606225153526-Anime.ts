import {MigrationInterface, QueryRunner} from "typeorm";

export class Anime1606225153526 implements MigrationInterface {
    name = 'Anime1606225153526'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "anime" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "episode" integer NOT NULL, "totalEpisode" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6e567f73ed63fd388a7734cbdd3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0a42549d5533e7684e78d5c437" ON "anime" ("name") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_0a42549d5533e7684e78d5c437"`);
        await queryRunner.query(`DROP TABLE "anime"`);
    }

}
