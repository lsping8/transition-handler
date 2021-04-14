import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateEp1618404377171 implements MigrationInterface {
  name = 'UpdateEp1618404377171';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "anime" DROP COLUMN "totalEpisode"
        `);
    await queryRunner.query(`
            COMMENT ON COLUMN "anime"."name" IS NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "anime"
            ADD CONSTRAINT "UQ_0a42549d5533e7684e78d5c4377" UNIQUE ("name")
        `);
    await queryRunner.query(`
            COMMENT ON COLUMN "anime"."episode" IS NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "anime"
            ALTER COLUMN "episode"
            SET DEFAULT '0'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "anime"
            ALTER COLUMN "episode" DROP DEFAULT
        `);
    await queryRunner.query(`
            COMMENT ON COLUMN "anime"."episode" IS NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "anime" DROP CONSTRAINT "UQ_0a42549d5533e7684e78d5c4377"
        `);
    await queryRunner.query(`
            COMMENT ON COLUMN "anime"."name" IS NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "anime"
            ADD "totalEpisode" integer NOT NULL
        `);
  }
}
