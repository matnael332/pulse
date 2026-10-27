// Waiting for the operator: pending, or the answer (rejected, suspended) with the operator's note.
import type { Company, CompanyStatus } from "../api";
import { useI18n } from "../i18n";
import classes from "./Data.module.css";
import { Rail } from "./Rail";
import { StepPanel } from "./StepPanel";

export function ApprovalStep({ company }: { company: Company }) {
  const { t } = useI18n();
  const status = company.status as Exclude<CompanyStatus, "active">;
  return (
    <>
      <Rail at="approval" failed={status !== "pending"} working={status === "pending"} />
      <StepPanel company={null} labelledBy="approval-title">
        <h2 id="approval-title" className={`${classes.display} ${classes.panelTitle}`}>
          {t(`status.${status}.title`)}
        </h2>
        <p className={classes.panelLead}>{t(`status.${status}.body`, { name: company.name })}</p>
        {status !== "pending" && company.note && (
          <p>{t("status.reason", { note: company.note })}</p>
        )}
      </StepPanel>
    </>
  );
}
