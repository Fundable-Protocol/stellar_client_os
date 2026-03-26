"use client";

import { useState } from "react";
import {
    MoreHorizontal,
    Eye,
    ExternalLink,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { DistributionAttributes } from "@/types/history";
import DistributionDetailsModal from "./DistributionDetailsModal";
import { STELLAR_EXPERT_URL } from "@/lib/constants";

interface ActionsCellProps {
    distribution: DistributionAttributes;
}

const ActionsCell = ({ distribution }: ActionsCellProps) => {
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

    const handleExplorerClick = () => {
        if (distribution.transaction_hash) {
            window.open(`${STELLAR_EXPERT_URL}/tx/${distribution.transaction_hash}`, "_blank");
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-zinc-800"
                        aria-label={`Actions for distribution ${distribution.transaction_hash ?? ""}`}
                    >
                        <MoreHorizontal className="h-4 w-4 text-white" aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="bg-zinc-950 border-zinc-800 text-white"
                >
                    <DropdownMenuItem
                        className="cursor-pointer focus:bg-zinc-800 focus:text-white"
                        onClick={() => setIsDetailsModalOpen(true)}
                    >
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                    </DropdownMenuItem>
                    {distribution.transaction_hash && (
                        <DropdownMenuItem
                            className="cursor-pointer focus:bg-zinc-800 focus:text-white"
                            onClick={handleExplorerClick}
                        >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View on Explorer
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <DistributionDetailsModal
                distribution={distribution}
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
            />
        </>
    );
};

export default ActionsCell;
