"""fix boolean columns in content_chunks

Revision ID: fix_boolean_columns
Revises: 
Create Date: 2026-02-06 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fix_boolean_columns'
down_revision = None  # Update this with your latest revision
branch_labels = None
depends_on = None


def upgrade():
    """Convert String columns to Boolean"""
    
    # Convert requires_attribution from String to Boolean
    op.execute("""
        ALTER TABLE content_chunks 
        ALTER COLUMN requires_attribution TYPE BOOLEAN 
        USING CASE 
            WHEN requires_attribution IN ('true', 't', 'yes', '1', 'True') THEN TRUE
            WHEN requires_attribution IN ('false', 'f', 'no', '0', 'False') THEN FALSE
            ELSE TRUE
        END
    """)
    
    # Convert is_policy_content from String to Boolean
    op.execute("""
        ALTER TABLE content_chunks 
        ALTER COLUMN is_policy_content TYPE BOOLEAN 
        USING CASE 
            WHEN is_policy_content IN ('true', 't', 'yes', '1', 'True') THEN TRUE
            WHEN is_policy_content IN ('false', 'f', 'no', '0', 'False') THEN FALSE
            ELSE FALSE
        END
    """)
    
    # Convert is_sensitive from String to Boolean
    op.execute("""
        ALTER TABLE content_chunks 
        ALTER COLUMN is_sensitive TYPE BOOLEAN 
        USING CASE 
            WHEN is_sensitive IN ('true', 't', 'yes', '1', 'True') THEN TRUE
            WHEN is_sensitive IN ('false', 'f', 'no', '0', 'False') THEN FALSE
            ELSE FALSE
        END
    """)
    
    # Set default values
    op.alter_column('content_chunks', 'requires_attribution',
                    server_default=sa.text('true'))
    op.alter_column('content_chunks', 'is_policy_content',
                    server_default=sa.text('false'))
    op.alter_column('content_chunks', 'is_sensitive',
                    server_default=sa.text('false'))


def downgrade():
    """Convert Boolean columns back to String"""
    
    # Convert requires_attribution from Boolean to String
    op.execute("""
        ALTER TABLE content_chunks 
        ALTER COLUMN requires_attribution TYPE VARCHAR 
        USING CASE 
            WHEN requires_attribution = TRUE THEN 'true'
            ELSE 'false'
        END
    """)
    
    # Convert is_policy_content from Boolean to String
    op.execute("""
        ALTER TABLE content_chunks 
        ALTER COLUMN is_policy_content TYPE VARCHAR 
        USING CASE 
            WHEN is_policy_content = TRUE THEN 'true'
            ELSE 'false'
        END
    """)
    
    # Convert is_sensitive from Boolean to String
    op.execute("""
        ALTER TABLE content_chunks 
        ALTER COLUMN is_sensitive TYPE VARCHAR 
        USING CASE 
            WHEN is_sensitive = TRUE THEN 'true'
            ELSE 'false'
        END
    """)
    
    # Set default values
    op.alter_column('content_chunks', 'requires_attribution',
                    server_default='true')
    op.alter_column('content_chunks', 'is_policy_content',
                    server_default='false')
    op.alter_column('content_chunks', 'is_sensitive',
                    server_default='false')
