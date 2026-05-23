"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditEventType = void 0;
var AuditEventType;
(function (AuditEventType) {
    AuditEventType["DocumentCreated"] = "document_created";
    AuditEventType["DocumentUploaded"] = "document_uploaded";
    AuditEventType["DocumentViewed"] = "document_viewed";
    AuditEventType["DocumentDeleted"] = "document_deleted";
    AuditEventType["StatusChanged"] = "status_changed";
    AuditEventType["StepStarted"] = "step_started";
    AuditEventType["StepCompleted"] = "step_completed";
    AuditEventType["StepSkipped"] = "step_skipped";
    AuditEventType["SignerAdded"] = "signer_added";
    AuditEventType["SignerInvited"] = "signer_invited";
    AuditEventType["SignerSkipped"] = "signer_skipped";
    AuditEventType["Signed"] = "signed";
    AuditEventType["Rejected"] = "rejected";
    AuditEventType["Commented"] = "commented";
    AuditEventType["CommentResolved"] = "comment_resolved";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
//# sourceMappingURL=index.js.map