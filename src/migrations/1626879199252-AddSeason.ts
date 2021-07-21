import {MigrationInterface, QueryRunner} from "typeorm";

export class AddSeason1626879199252 implements MigrationInterface {
    name = 'AddSeason1626879199252'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "anime" ADD "season" integer NOT NULL DEFAULT '1'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "anime" DROP COLUMN "season"`);
    }

}
