import { Router } from "express";
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  updateAdminUserStatus,
} from "../controllers/adminUserController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  validateAdminUser,
  validateAdminUserStatus,
  validateObjectId,
} from "../validators/adminValidators.js";

const router = Router();

router.use(authenticate, authorizeRoles("admin"));

router.get("/", listAdminUsers);
router.post("/", validateAdminUser, createAdminUser);
router.patch("/:userId", validateObjectId("userId"), validateAdminUser, updateAdminUser);
router.patch(
  "/:userId/status",
  validateObjectId("userId"),
  validateAdminUserStatus,
  updateAdminUserStatus,
);
router.delete("/:userId", validateObjectId("userId"), deleteAdminUser);

export default router;
