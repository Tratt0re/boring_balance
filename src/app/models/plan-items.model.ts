import type { PlanItemDto, PlanItemRuleJsonDto, PlanItemTemplateJsonDto, PlanItemType } from '@/dtos';

import type { RowId, UnixTimestampMilliseconds } from './common.model';

function cloneRuleJson(rule: PlanItemRuleJsonDto): PlanItemRuleJsonDto {
  return {
    ...rule,
    frequency: {
      ...rule.frequency,
    },
  };
}

function cloneTemplateJson(template: PlanItemTemplateJsonDto): PlanItemTemplateJsonDto {
  return {
    ...template,
  };
}

export class PlanItemModel {
  constructor(
    public readonly id: RowId,
    public readonly title: string,
    public readonly type: PlanItemType,
    public readonly templateJson: PlanItemTemplateJsonDto,
    public readonly ruleJson: PlanItemRuleJsonDto,
    public readonly createdAt: UnixTimestampMilliseconds,
    public readonly updatedAt: UnixTimestampMilliseconds | null,
  ) {}

  static fromDTO(dto: PlanItemDto): PlanItemModel {
    return new PlanItemModel(
      dto.id,
      dto.title,
      dto.type,
      cloneTemplateJson(dto.template_json),
      cloneRuleJson(dto.rule_json),
      dto.created_at,
      dto.updated_at,
    );
  }

  toDTO(): PlanItemDto {
    return {
      id: this.id,
      title: this.title,
      type: this.type,
      template_json: cloneTemplateJson(this.templateJson),
      rule_json: cloneRuleJson(this.ruleJson),
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
