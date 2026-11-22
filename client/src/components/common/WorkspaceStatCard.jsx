import { motion } from "motion/react";
import { Card } from "../ui/card.jsx";

function WorkspaceStatCard({
  icon: Icon,
  label,
  value,
  description,
  tone = "blue",
}) {
  const tones = {
    blue: "bg-blue-50 text-brand-blue",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-purple-50 text-brand-violet",
    red: "bg-red-50 text-red-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-brand-slate">{label}</span>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              tones[tone] ?? tones.blue
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
        <div className="font-display text-2xl font-extrabold text-brand-onyx">
          {value}
        </div>
        <div className="mt-1 text-[11px] text-brand-slate">{description}</div>
      </Card>
    </motion.div>
  );
}

export default WorkspaceStatCard;
