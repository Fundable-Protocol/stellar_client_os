import { Button } from "@/components/ui/button"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogClose, 
  DialogFooter 
} from "@/components/ui/dialog"
import { PaymentStreamSummary } from "./PaymentStreamSummary"
import { PaymentStreamFormData } from "@/lib/validations"

interface PaymentStreamConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: PaymentStreamFormData
  onConfirm: (data: PaymentStreamFormData) => Promise<void>
  isSubmitting: boolean
  estimatedFee?: string | null
  isEstimatingFee?: boolean
}

export function PaymentStreamConfirmationModal({
  open,
  onOpenChange,
  data,
  onConfirm,
  isSubmitting,
  estimatedFee,
  isEstimatingFee = false
}: PaymentStreamConfirmationModalProps) {
  const handleConfirm = () => {
    onConfirm(data)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-2xl sm:w-full max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Confirm Payment Stream</DialogTitle>
          <DialogDescription>
            Please review the payment stream details before confirming the transaction.
          </DialogDescription>
          <DialogClose onClick={() => onOpenChange(false)} />
        </DialogHeader>
        
        <div className="space-y-4">
          
          <PaymentStreamSummary 
            data={data} 
            estimatedFee={estimatedFee}
            isEstimatingFee={isEstimatingFee}
          />
          
          <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
            <h4 className="font-medium text-yellow-400 mb-2">Important Notes:</h4>
            <ul className="text-sm text-yellow-300 space-y-1">
              <li>• This transaction will be submitted to the Stellar network</li>
              <li>• The total amount will be locked in the smart contract</li>
              <li>• The recipient can withdraw tokens as they vest over time</li>
              {data.cancelable && (
                <li>• You can cancel this stream at any time and recover remaining funds</li>
              )}
              {!data.cancelable && (
                <li>• This stream cannot be canceled once created</li>
              )}
            </ul>
          </div>
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating Stream..." : "Confirm & Create Stream"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
